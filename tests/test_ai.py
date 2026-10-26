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


class CompileTest(unittest.TestCase):
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

    def test_unrelated_text_does_not_force_a_model_answer(self):
        sources,_=self.index.retrieve('请给我写一段python爬虫代码')
        self.assertEqual(sources,[])


if __name__=='__main__':unittest.main()
