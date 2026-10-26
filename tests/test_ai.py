import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ai_for_test', ROOT/'server/ai.py')
AI = importlib.util.module_from_spec(spec)
spec.loader.exec_module(AI)


def plan():
    return {'status':'ready','name':'三人跑传','summary':'传给切入队员后换位。','assumptions':['距离仅示意'],
            'players':[{'id':1,'team':'offense','x':200,'y':280},{'id':2,'team':'offense','x':600,'y':120},{'id':3,'team':'offense','x':600,'y':430}],
            'disc_holder':1,'markers':[{'x':750,'y':250,'label':'接盘点'}],
            'steps':[{'name':'第一传','notes':'O2 切入接 O1 的盘。','moves':[{'player':2,'x':750,'y':250,'via':[{'x':650,'y':150}]}],'pass':{'from':1,'to':2}},
                     {'name':'第二传','notes':'O1 接 O2 的回盘。','moves':[{'player':1,'x':450,'y':350,'via':[]}],'pass':{'from':2,'to':1}}]}


class KnowledgeTest(unittest.TestCase):
    def test_aliases_boundaries_and_direction_frame(self):
        kb=AI.TacticKnowledge(ROOT/'dist/knowledge/tactics.json')
        matches={e['id'] for e in kb.match('O1 HANDLER; O2 cut-in，O3 go deep。再跨场传盘，回切；Open side 与 Break-side。')}
        self.assertTrue({'handler','cut-in','go-deep','cross-field','open','break'}<=matches)
        self.assertNotIn('open',{e['id'] for e in kb.match('reopened')})
        self.assertNotIn('break',{e['id'] for e in kb.match('breakfast')})
        self.assertIn('主要改变 y',kb.context('Swing'))
        self.assertIn('不能直接等同画面上/下',kb.context('普通配合'))
        self.assertIn('角色本身不代表',kb.context('Handler'))


class OutlineTest(unittest.TestCase):
    def raw(self):
        return {'name':'双人传接','roles':[{'label':'O1','description':'拿盘的人'},{'label':'O2','description':'往前跑的人'}],
                'setup':'O1 持盘、O2 在前方。','steps':['O2 向前跑，O1 传给 O2。'],'markers':[],
                'ending':'接盘后结束。','questions':[],'assumptions':[]}
    def test_formal_review_retains_numbered_roles_and_unknown_information(self):
        raw=self.raw();raw['questions']=['O2 具体向哪个接盘位置切入？']
        result=AI.formal_outline(raw,'drill',2,0)
        self.assertEqual(result['status'],'review');self.assertIn('O1：拿盘的人',result['formal_description'])
        self.assertIn('长边',result['formal_description']);self.assertIn(raw['questions'][0],result['formal_description'])
        self.assertNotIn('tactic',result);self.assertNotIn('frames',result)
    def test_wrong_role_labels_and_unbounded_output_are_rejected(self):
        for label in ['O1','O3','D1']:
            raw=self.raw();raw['roles'][1]['label']=label
            with self.assertRaises(AI.AIError):AI.formal_outline(raw,'drill',2,0)
        raw=self.raw();raw['steps']=['a'*501]
        with self.assertRaises(AI.AIError):AI.formal_outline(raw,'drill',2,0)
    def test_defensive_roles_remain_distinct(self):
        raw=self.raw();raw['roles'].append({'label':'D1','description':'防 O2 的人'})
        result=AI.formal_outline(raw,'drill',2,1)
        self.assertIn('D1：防 O2 的人',result['formal_description'])


class CompileTest(unittest.TestCase):
    def test_named_cut_direction_and_lateral_pass_intents_are_checked(self):
        raw=plan();move=raw['steps'][0]['moves'][0];move.update(intent='cut_in',x=750,y=250)
        with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(raw,'drill',3,0)
        move.update(x=450,y=220);self.assertEqual(AI.compile_plan(raw,'drill',3,0)['status'],'ready')
        for intent in ['go_deep','upline']:
            move.update(intent=intent,x=450,y=220)
            with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(raw,'drill',3,0)
            move.update(x=750,y=250);self.assertEqual(AI.compile_plan(raw,'drill',3,0)['status'],'ready')
        move.update(intent='other',x=750,y=280);raw['steps'][0]['pass']['intent']='swing'
        with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(raw,'drill',3,0)
        move.update(y=350);self.assertEqual(AI.compile_plan(raw,'drill',3,0)['status'],'ready')

    def test_overlapping_start_and_return_to_occupied_queue_are_rejected(self):
        bad=plan();bad['players'][1].update(x=600,y=430)
        with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(bad,'drill',3,0)
        bad=plan();bad['steps'][0]['moves'][0].update(x=600,y=430)
        with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(bad,'drill',3,0)

    def test_stationary_route_cannot_pretend_to_be_a_cut(self):
        raw=plan();raw['steps'][0]['moves'][0].update(x=600,y=120,via=[])
        with self.assertRaises(AI.PlanGeometryError):AI.compile_plan(raw,'drill',3,0)

    def test_queue_can_advance_while_another_player_returns_to_the_vacated_slot(self):
        raw=plan();raw['steps']=[{'name':'队列前移','notes':'O3 前移，O2 回到空出的队尾。','moves':[{'player':2,'x':600,'y':430},{'player':3,'x':700,'y':430}],'pass':None}]
        result=AI.compile_plan(raw,'drill',3,0)
        self.assertEqual(result['status'],'ready')
        self.assertEqual(len(result['tactic']['frames'][1]['routes']),2)

    def test_plan_compiles_continuous_positions_and_actual_receiving_points(self):
        result=AI.compile_plan(plan(),'drill',3,0)
        t=result['tactic'];self.assertEqual(len(t['frames']),3)
        self.assertEqual(len(t['markers']),1)
        self.assertEqual(t['frames'][0]['routes'],[])
        for before,after in zip(t['frames'],t['frames'][1:]):
            expected=copy.deepcopy(before['players']);disc=copy.deepcopy(before['disc'])
            for route in before['routes']:
                if route['kind']=='run':next(p for p in expected if p['id']==route['player']).update(route['end'])
                else:disc=route['end']
            self.assertEqual(expected,after['players'])
            self.assertEqual(disc,after['disc'])
        for frame in t['frames'][1:]:
            passing=next(r for r in frame['routes'] if r['kind']=='pass')
            receiver=next(p for p in frame['players'] if p['id']!=passing['player'] and ((next((r['end'] for r in frame['routes'] if r['kind']=='run' and r['player']==p['id']),p))['x']==passing['end']['x']))
            self.assertNotEqual(receiver['id'],passing['player'])
        self.assertIn('绘图约定',t['frames'][0]['notes'])

    def test_uncertain_plan_asks_questions_instead_of_inventing(self):
        result=AI.compile_plan({'status':'clarify','questions':['谁先持盘？']},'drill',3,0)
        self.assertEqual(result['status'],'clarify');self.assertNotIn('tactic',result)

    def test_invalid_geometry_holder_and_casts_are_rejected(self):
        mutations=[lambda p:p['players'][0].update(x=9999),
                   lambda p:p.update(disc_holder=7),
                   lambda p:p['steps'][0]['pass'].update(to=99),
                   lambda p:p['steps'][1]['pass'].update(**{'from':1}),
                   lambda p:p['steps'][0]['moves'].append({'player':1,'x':500,'y':200}),
                   lambda p:p['players'][0].update(team='defense')]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                p=plan();mutate(p)
                with self.assertRaises(AI.AIError):AI.compile_plan(p,'drill',3,0)


class RetrievalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.index=AI.RuleIndex(ROOT/'dist/wfdf')

    def test_restart_count_includes_formula_and_pick_exceptions(self):
        sources,_=self.index.retrieve('防守犯规有争议，原来数到4，应该怎么数秒？')
        refs={e['ref'] for e in sources if e['doc']=='core'}
        self.assertTrue({'9.5.1','9.5.2','9.5.3','9.5.4','9.5.5.1','9.5.5.2','9.6','9.6.1'}<=refs)
        self.assertTrue(all(e.get('citation') for e in sources))

    def test_pick_returns_full_section_and_existing_signal(self):
        sources,visuals=self.index.retrieve('Pick 之后如何恢复比赛？')
        refs={e['ref'] for e in sources if e['doc']=='core'}
        self.assertIn('18.3.1.1',refs);self.assertIn('18.3.3.1',refs)
        self.assertIn('signal-10',{v['id'] for v in visuals})

    def test_travel_retains_running_catch_exception(self):
        sources,_=self.index.retrieve('接盘后走步算不算违规？')
        self.assertTrue({'18.2.1.1.1','18.2.1.1.2','18.2.8'}<={e['ref'] for e in sources})

    def test_event_appendix_has_applicability_context(self):
        sources,_=self.index.retrieve('混合赛的男女比例怎么决定？')
        self.assertIn('appendix:page:2',{e['key'] for e in sources})
        self.assertTrue(any(e['doc']=='appendix' and e['citation'].startswith('附录p') for e in sources))

    def test_natural_restart_question_prioritizes_counts_and_accepted_gesture(self):
        sources,visuals=self.index.retrieve('防守方犯规，双方无争议，原来数到4，应该从几开始？')
        self.assertEqual(sources[0]['ref'],'9.5')
        ids={v['id'] for v in visuals}
        self.assertIn('signal-05',ids)
        self.assertNotIn('signal-04',ids)
        self.assertNotIn('signal-17',ids)
        self.assertNotIn('signal-14',ids)

    def test_english_self_touch_scenario_keeps_decisive_annotation_and_turnover_location(self):
        query = ('The thrower releases the disc.\n'
                 'The thrower then taps the disc to avoid an interception by a defender.\n'
                 'The disc hits the ground.\n'
                 'The defender gets possession where they would have caught the pass.')
        sources,visuals = self.index.retrieve(query)
        refs = {e['citation'] for e in sources}
        self.assertTrue({'13.2.5','13.1.1','13.5','13.7.1','13.8','13.9','13.10','13.11','注释13.5'} <= refs)
        annotation = next(e for e in sources if e['citation']=='注释13.5')
        self.assertIn('The thrower may touch a disc they have thrown', annotation['en'])
        self.assertIn('signal-08', {v['id'] for v in visuals})
        self.assertNotIn('signal-14', {v['id'] for v in visuals})
        self.assertLessEqual(len(sources),74)

    def test_chinese_self_touch_retrieves_same_exception(self):
        sources,_ = self.index.retrieve('出盘后自己拍盘阻止对方截盘，盘落地。对手能在本来要接到的位置拿盘吗？')
        self.assertTrue({'13.1.1','13.7.1','注释13.5'} <= {e['citation'] for e in sources})

    def test_english_lexical_fallback_without_topic_alias(self):
        sources,_ = self.index.retrieve('After I release it, may I touch my own throw before anyone else?')
        self.assertTrue({'13.2.5','注释13.5'} <= {e['citation'] for e in sources})

    def test_english_substrings_do_not_trigger_unrelated_rules_or_gestures(self):
        sources,visuals = self.index.retrieve('write a python script to download images')
        self.assertEqual(sources,[])
        self.assertEqual(visuals,[])
        sources,visuals = self.index.retrieve('uncontested defensive foul, the stall count was four, where do we restart?')
        self.assertIn('9.5.1', {e['citation'] for e in sources})
        self.assertNotIn('signal-04', {v['id'] for v in visuals})

    def test_unrelated_text_does_not_force_a_model_answer(self):
        sources,_=self.index.retrieve('请给我写一段python爬虫代码')
        self.assertEqual(sources,[])


if __name__=='__main__':unittest.main()
