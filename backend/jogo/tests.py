from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from questoes.models import Questao

from . import services as s
from .models import Perfil, Revisao


class BaseJogo(TestCase):
    def setUp(self):
        call_command("popular_demo", verbosity=0)
        self.user = get_user_model().objects.create_user("teste", password="x")
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def questao(self, n=0):
        return Questao.objects.order_by("id")[n]

    def responder(self, q, certa=True, tempo=20, modo="treino"):
        alt = q.alternativas.get(correta=certa) if certa else q.alternativas.filter(correta=False).first()
        return s.registrar_resposta(self.user, q, alt, tempo, modo)


class RegrasXPTest(BaseJogo):
    def test_acerto_da_xp_e_trofeus(self):
        q = self.questao()
        r = self.responder(q, True)
        self.assertTrue(r["correta"])
        self.assertEqual(r["xp_ganho"], s.CFG["XP_POR_DIFICULDADE"][q.dificuldade])
        self.assertEqual(r["trofeus_delta"], s.CFG["TROFEUS_ACERTO"])

    def test_combo_aumenta_xp(self):
        self.responder(self.questao(0), True)
        q = self.questao(1)
        r = self.responder(q, True)
        self.assertEqual(r["detalhe_xp"]["combo"], 1)
        self.assertEqual(r["combo"], 2)

    def test_erro_zera_combo_e_agenda_revisao(self):
        self.responder(self.questao(0), True)
        q = self.questao(1)
        r = self.responder(q, False)
        self.assertEqual(r["xp_ganho"], 0)
        self.assertEqual(r["combo"], 0)
        rev = Revisao.objects.get(usuario=self.user, questao=q)
        self.assertEqual(rev.proxima_em, timezone.localdate())  # reforço no mesmo dia
        self.assertEqual(r["revisao"]["status"], "reforco")

    def test_anti_farm_questao_repetida(self):
        q = self.questao()
        cheio = self.responder(q, True)["xp_ganho"]
        perfil = Perfil.objects.get(usuario=self.user)
        perfil.combo_atual = 0
        perfil.save()
        repetida = self.responder(q, True)
        self.assertLess(repetida["xp_ganho"], cheio)
        self.assertEqual(repetida["trofeus_delta"], 0)

    def test_resposta_rapida_demais_vale_metade(self):
        q = self.questao()
        r = self.responder(q, True, tempo=1)
        self.assertEqual(r["xp_ganho"], round(s.CFG["XP_POR_DIFICULDADE"][q.dificuldade] * 0.5))

    def test_trofeus_nao_ficam_negativos(self):
        self.responder(self.questao(0), False)
        self.assertEqual(Perfil.objects.get(usuario=self.user).trofeus, 0)


class MetaEOfensivaTest(BaseJogo):
    def bater_meta(self):
        perfil = s.obter_perfil(self.user)
        perfil.meta_diaria = 3
        perfil.save()
        resultados = [self.responder(self.questao(i), True) for i in range(3)]
        return resultados[-1]

    def test_meta_concluida_e_recompensa(self):
        r = self.bater_meta()
        self.assertTrue(r["meta_concluida_agora"])
        perfil = Perfil.objects.get(usuario=self.user)
        self.assertEqual(perfil.ofensiva_atual, 1)
        ouro_antes = perfil.ouro
        s.coletar_recompensa_meta(self.user)
        perfil.refresh_from_db()
        self.assertEqual(perfil.ouro, ouro_antes + s.CFG["RECOMPENSA_META"]["ouro"])
        with self.assertRaises(s.RegraDoJogoError):
            s.coletar_recompensa_meta(self.user)

    def test_ofensiva_continua_no_dia_seguinte(self):
        perfil = s.obter_perfil(self.user)
        perfil.ofensiva_atual = 5
        perfil.ultimo_dia_meta = timezone.localdate() - timedelta(days=1)
        perfil.save()
        self.bater_meta()
        perfil.refresh_from_db()
        self.assertEqual(perfil.ofensiva_atual, 6)

    def test_ofensiva_quebra_apos_dia_perdido(self):
        perfil = s.obter_perfil(self.user)
        perfil.ofensiva_atual = 5
        perfil.ultimo_dia_meta = timezone.localdate() - timedelta(days=3)
        perfil.save()
        self.assertEqual(s.ofensiva_vigente(perfil), 0)
        self.bater_meta()
        perfil.refresh_from_db()
        self.assertEqual(perfil.ofensiva_atual, 1)

    def test_congelador_protege_ofensiva(self):
        perfil = s.obter_perfil(self.user)
        perfil.ofensiva_atual = 5
        perfil.congeladores = 1
        perfil.ultimo_dia_meta = timezone.localdate() - timedelta(days=2)
        perfil.save()
        self.bater_meta()
        perfil.refresh_from_db()
        self.assertEqual(perfil.ofensiva_atual, 6)
        self.assertEqual(perfil.congeladores, 0)


class RevisaoTest(BaseJogo):
    def liberar(self, q):
        """Simula que o prazo da revisão chegou."""
        rev = Revisao.objects.get(usuario=self.user, questao=q)
        rev.proxima_em = timezone.localdate()
        rev.liberada_em = None
        rev.save()
        return rev

    def test_erro_volta_em_minutos_e_so_depois_fica_disponivel(self):
        q = self.questao()
        r = self.responder(q, False)
        self.assertIn("minutos", r["revisao"]["mensagem"])
        self.assertEqual(s.revisoes_disponiveis(self.user).count(), 0)  # ainda esperando os 10 min
        rev = Revisao.objects.get(usuario=self.user, questao=q)
        rev.liberada_em = timezone.now() - timedelta(seconds=1)
        rev.save()
        self.assertEqual(s.revisoes_disponiveis(self.user).count(), 1)
        self.assertEqual(s.proxima_questao(self.user, "revisao").id, q.id)

    def test_reforco_agenda_para_amanha_sem_trofeus(self):
        q = self.questao()
        self.responder(q, False)
        self.liberar(q)
        r = self.responder(q, True, modo="revisao")
        rev = Revisao.objects.get(usuario=self.user, questao=q)
        self.assertEqual(rev.intervalo_dias, 1)
        self.assertEqual(rev.proxima_em, timezone.localdate() + timedelta(days=1))
        self.assertEqual(r["trofeus_delta"], 0)  # reforço não rende troféu (anti-farm)
        self.assertIn("amanhã", r["revisao"]["mensagem"])

    def test_intervalo_cresce_pela_facilidade_e_conta_trofeu(self):
        q = self.questao()
        self.responder(q, False)
        self.liberar(q)
        self.responder(q, True, modo="revisao")  # reforço → 1 dia
        self.liberar(q)
        r = self.responder(q, True, modo="revisao")
        rev = Revisao.objects.get(usuario=self.user, questao=q)
        self.assertEqual(rev.intervalo_dias, 3)  # ceil(1 x 2.5)
        self.assertEqual(r["trofeus_delta"], s.CFG["TROFEUS_ACERTO"])
        self.liberar(q)
        self.responder(q, True, modo="revisao")
        rev.refresh_from_db()
        self.assertEqual(rev.intervalo_dias, 8)  # ceil(3 x 2.5)

    def test_resposta_rapida_aumenta_intervalo(self):
        for i in range(1, 4):  # tempo médio ~30s
            self.responder(self.questao(i), True, tempo=30)
        q = self.questao()
        self.responder(q, False)
        rev = self.liberar(q)
        rev.intervalo_dias = 3
        rev.save()
        r = self.responder(q, True, tempo=8, modo="revisao")
        rev.refresh_from_db()
        self.assertGreater(rev.intervalo_dias, 8)
        self.assertIn("Rápido", r["revisao"]["mensagem"])

    def test_teimosa_fica_limitada_a_7_dias(self):
        q = self.questao()
        for _ in range(3):
            r = self.responder(q, False)
        self.assertTrue(r["revisao"]["teimosa"])
        rev = self.liberar(q)
        rev.intervalo_dias = 20
        rev.save()
        self.responder(q, True, modo="revisao")
        rev.refresh_from_db()
        self.assertEqual(rev.intervalo_dias, 7)
        self.assertFalse(rev.concluida)

    def test_aprendida_sai_da_revisao(self):
        q = self.questao()
        self.responder(q, False)
        rev = self.liberar(q)
        rev.intervalo_dias = 30
        rev.save()
        r = self.responder(q, True, modo="revisao")
        rev.refresh_from_db()
        self.assertTrue(rev.concluida)
        self.assertEqual(r["revisao"]["status"], "aprendida")

    def test_acerto_antes_do_prazo_nao_muda_nada(self):
        q = self.questao()
        self.responder(q, False)
        self.liberar(q)
        self.responder(q, True)  # reforço → amanhã
        r = self.responder(q, True)
        self.assertEqual(r["revisao"]["status"], "mantida")
        self.assertEqual(Revisao.objects.get(usuario=self.user, questao=q).intervalo_dias, 1)

    def test_missao_mistura_revisao_a_cada_4(self):
        q = self.questao(5)
        self.responder(q, False)
        self.liberar(q)
        # 3 questões já feitas hoje (contando o erro acima: 1 + 2)
        self.responder(self.questao(0), True)
        self.responder(self.questao(1), True)
        self.assertEqual(s.proxima_questao(self.user, "missao").id, q.id)


class NiveisELigasTest(TestCase):
    def test_nivel_geral(self):
        self.assertEqual(s.info_nivel_geral(0).nivel, 1)
        self.assertEqual(s.info_nivel_geral(400).nivel, 2)
        self.assertEqual(s.info_nivel_geral(399).xp_para_proximo, 400)

    def test_ligas(self):
        self.assertEqual(s.info_liga(0)["nome"], "Bronze III")
        liga = s.info_liga(860)
        self.assertEqual(liga["nome"], "Ouro II")
        self.assertEqual(liga["faltam"], 140)
        self.assertIsNone(s.info_liga(5000)["proxima_liga"])


class ConquistasTest(BaseJogo):
    def test_primeira_questao(self):
        r = self.responder(self.questao(), True)
        self.assertIn("primeira-questao", [c["codigo"] for c in r["conquistas_novas"]])


class ApiTest(BaseJogo):
    def test_fluxo_completo(self):
        painel = self.api.get("/api/painel/").json()
        self.assertEqual(painel["nivel"]["nivel"], 1)
        self.assertEqual(len(painel["materias"]), 5)

        q = self.api.get("/api/questoes/proxima/").json()["questao"]
        self.assertNotIn("correta", q["alternativas"][0])  # gabarito não vaza

        questao = Questao.objects.get(pk=q["id"])
        alt = questao.alternativa_correta
        r = self.api.post(f"/api/questoes/{q['id']}/responder/",
                          {"alternativa_id": alt.id, "tempo_segundos": 30}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["correta"])

        stats = self.api.get("/api/estatisticas/").json()
        self.assertEqual(stats["total_respondidas"], 1)

        trilha = self.api.get("/api/trilha/").json()
        self.assertEqual(len(trilha["marcos"]), 7)

    def test_alternativa_de_outra_questao_e_rejeitada(self):
        q1, q2 = self.questao(0), self.questao(1)
        r = self.api.post(f"/api/questoes/{q1.id}/responder/",
                          {"alternativa_id": q2.alternativas.first().id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_anotacao_rende_ouro_so_na_primeira_vez(self):
        q = self.questao()
        r1 = self.api.post(f"/api/questoes/{q.id}/anotacao/", {"texto": "lembrar"}, format="json")
        r2 = self.api.post(f"/api/questoes/{q.id}/anotacao/", {"texto": "editado"}, format="json")
        self.assertEqual(r1.json()["ouro_ganho"], s.CFG["OURO_POR_ANOTACAO"])
        self.assertEqual(r2.json()["ouro_ganho"], 0)

    def test_exige_login(self):
        self.assertEqual(APIClient().get("/api/painel/").status_code, 403)


class HistoricoTest(BaseJogo):
    def test_historico_preenche_dias_e_semanas(self):
        self.responder(self.questao(0), True)
        self.responder(self.questao(1), False)
        r = self.api.get("/api/historico/").json()
        self.assertEqual(len(r["dias"]), 182)
        self.assertEqual(r["dias"][-1]["respondidas"], 2)
        self.assertEqual(r["dias"][-1]["acertos"], 1)
        self.assertEqual(r["dias"][0]["respondidas"], 0)
        self.assertEqual(r["dias_com_estudo"], 1)
        self.assertEqual(len(r["semanas"]), 12)
        self.assertEqual(r["semanas"][-1]["percentual"], 50)
        self.assertEqual(len(r["conquistas"]), 8)
        self.assertTrue(any(c["obtida"] for c in r["conquistas"]))


class BatalhaTest(BaseJogo):
    def setUp(self):
        super().setUp()
        from . import batalha as bt
        self.bt = bt

    def lutar(self, certa=True, n=0):
        q = self.questao(n % 8)
        alt = q.alternativas.get(correta=True) if certa else q.alternativas.filter(correta=False).first()
        return self.bt.responder(self.user, q, alt, 20)

    def test_orc_criado_e_inicio(self):
        b = self.bt.iniciar(self.user)
        self.assertEqual(b.inimigo.slug, "orc")
        self.assertEqual((b.vida_inimigo, b.vida_jogador), (20, s.settings.JOGO["BATALHA"]["vidas_jogador"]))
        self.assertEqual(self.bt.iniciar(self.user).id, b.id)  # não cria duas

    def test_acerto_tira_vida_do_inimigo_erro_tira_a_sua(self):
        self.bt.iniciar(self.user)
        r = self.lutar(True)
        self.assertEqual(r["evento"], "ataque")
        self.assertEqual(r["batalha"]["vida_inimigo"], 19)
        self.assertEqual(r["batalha"]["vida_inimigo_pct"], 95)
        r = self.lutar(False, 1)
        self.assertEqual(r["evento"], "dano")
        self.assertEqual(r["batalha"]["vida_jogador"], 4)
        self.assertEqual(r["batalha"]["sequencia"], 0)
        self.assertEqual(r["resultado"]["xp_ganho"], 0)  # o fluxo normal continua valendo

    def test_vitoria_com_20_acertos_da_recompensa(self):
        self.bt.iniciar(self.user)
        for i in range(19):
            self.assertEqual(self.lutar(True, i)["evento"], "ataque")
        r = self.lutar(True, 19)
        self.assertEqual(r["evento"], "vitoria")
        self.assertEqual(r["batalha"]["recompensa"]["ouro"], 40)
        perfil = Perfil.objects.get(usuario=self.user)
        self.assertGreaterEqual(perfil.ouro, 40)
        self.assertIsNone(self.bt.batalha_atual(self.user))

    def test_derrota_com_5_erros(self):
        self.bt.iniciar(self.user)
        for i in range(4):
            self.lutar(False, i)
        r = self.lutar(False, 4)
        self.assertEqual(r["evento"], "derrota")
        self.assertEqual(r["batalha"]["recompensa"]["ouro"], 0)

    def test_api_completa(self):
        self.assertIsNone(self.api.get("/api/batalha/").json()["atual"])
        b = self.api.post("/api/batalha/iniciar/", {"inimigo": "orc"}, format="json").json()
        q = self.questao()
        r = self.api.post("/api/batalha/responder/", {"questao_id": q.id, "alternativa_id": q.alternativas.get(correta=True).id,
                                                      "tempo_segundos": 15}, format="json").json()
        self.assertEqual(r["batalha"]["id"], b["id"])
        self.assertEqual(r["batalha"]["acertos"], 1)
        self.assertEqual(self.api.post("/api/batalha/desistir/").json()["batalha"]["status"], "desistencia")
        r = self.api.post("/api/batalha/responder/", {"questao_id": q.id, "alternativa_id": q.alternativas.first().id}, format="json")
        self.assertEqual(r.status_code, 400)
