"""Render WFDF official illustration regions with Poppler. PDFs are external inputs only.
Usage: python3 scripts/build-rule-visuals.py /path/hand-signals.pdf /path/pull-diagrams.pdf
No drawings are generated or reinterpreted. Captions are team-provided translations.
"""
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/wfdf/visuals'
OUT.mkdir(parents=True,exist_ok=True)
HAND='https://rules.wfdf.sport/wp-content/uploads/2025/03/WFDF-Rules-of-Ultimate-2025-2028-Hand-Signals.pdf'
PULL='https://rules.wfdf.sport/wp-content/uploads/2025/03/WFDF-Rules-of-Ultimate-2025-2028-Pull-Diagrams.pdf'
# Number, title, English call, action description (translated), related clauses, search aliases.
SIGNALS=[
 ('犯规','Foul','一臂平伸，另一前臂向下切过平伸的手臂。',['15.1','17'],['犯规','危险动作','foul','strip']),
 ('违例','Violation','双手握拳举过头顶，形成 V 字。',['15.3','18.1.4','18.2.6'],['违例','violation']),
 ('得分','Goal','双臂完全伸直向上举，掌心相对。',['14'],['得分','端区','goal','score']),
 ('有争议','Contest','双拳在胸前相碰，手背朝外。',['15.10','1.12','13.4'],['争议','contest','不认']),
 ('接受示意','Accepted','双肘贴住躯干，前臂向前伸，掌心向上。',['15.10','17'],['接受','无争议','accepted']),
 ('撤回示意','Retracted','双臂向下伸在身前，交叉挥动。',['15.11','16.3'],['撤回','retracted']),
 ('界内 / 界外 / 得分区外','In / Out','手臂伸直、手掌平展，指向场内表示界内，指向场外表示界外。',['11','14.1'],['出界','界内','踩线','out of bounds','in bounds']),
 ('盘落地','Down','手臂斜向下约 45 度伸直，食指指向地面。',['13.1.1'],['落地','down']),
 ('盘未落地','Up','手肘向下、前臂竖直，食指朝上。',['12.1'],['盘未落地','接住','up']),
 ('阻挡','Pick','双臂抬起、手肘弯曲，双拳朝向头部。',['18.3'],['pick','阻挡','挡拆']),
 ('走步','Travel','双手握拳，在身体前方沿竖直圆圈转动手腕。',['18.2'],['走步','走几步','跑几步','travel','轴心','pivot']),
 ('防盘违规','Marking Infraction','双臂向两侧伸直，掌心朝前。',['18.1'],['防盘','双人防守','包夹','快数','间距','double team','disc space','wrapping','fast count']),
 ('攻防转换','Turnover','右臂在身前伸直，掌心先朝上，再转向下。',['13'],['转换','turnover']),
 ('时间违例','Timing Violation','张开手掌，轻拍头顶。',['9','10.5','A5'],['读秒','超时','数秒','stall','时间违例']),
 ('越位 / 提前启动','Offside / False Start','双臂在头顶交叉成 X 字，双手握拳。',['7.5'],['越位','提前启动','offside','false start']),
 ('暂停','Time-out','双手，或一只手和飞盘，组成 T 字。',['20'],['暂停','time-out','time out']),
 ('精神暂停','Spirit Stoppage','用双手组成倒 T 字。',['1','A13'],['飞盘精神','精神暂停','spirit']),
 ('受伤 / 技术中断','Injury / Technical','双手相握，弯曲双臂举过头顶。',['19'],['受伤','流血','技术中断','injury','technical']),
 ('对位比例：男性','Male Matching','双手扣在脑后，手肘向两侧打开。',['5.4','6.4','A6'],['男女比例','混合','mixed','male matching','abba']),
 ('对位比例：女性','Female Matching','双臂向两侧伸直，双手握拳。',['5.4','6.4','A6'],['男女比例','混合','mixed','female matching','abba']),
 ('比赛已停止','Play Has Stopped','双臂伸直举过头顶，交叉挥动。',['15.7','8.1.3'],['停止','中断','stopped']),
 ('哪一队做出示意','Who Made the Call','双臂伸直，指向做出示意的队伍所防守的得分区。',['15.13'],['哪队','示意方','who made the call']),
 ('未影响比赛','Did Not Affect the Play','一只手张开举过头顶，前后挥动。',['16.3'],['未影响','不影响','did not affect']),
 ('赛点','Match Point','双臂伸直指向左上方，掌心向下。',['4.2','A4'],['赛点','match point']),
]
rows={1:[(48,226),(385,180),(670,180),(960,178)],2:[(90,195),(388,185),(668,190),(960,185)]}
entries=[]
for i,(zh,en,description,refs,aliases) in enumerate(SIGNALS,1):
    page=1+(i-1)//12;cell=(i-1)%12;row,col=divmod(cell,3)
    x=[14,317,615][col];y,h=rows[page][row];scale=2000/1300
    args=['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','2000','-x',str(round(x*scale)),'-y',str(round(y*scale)),'-W',str(round(290*scale)),'-H',str(round(h*scale)),'-png',sys.argv[1],str(OUT/f'signal-{i:02}')]
    subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
    entries.append({'id':f'signal-{i:02}','kind':'signal','number':i,'title':zh,'en':en,'description':description,'refs':refs,'aliases':aliases,'image':f'wfdf/visuals/signal-{i:02}.png','source':HAND+f'#page={page}'})
# Each original panel includes its own flight/roll/pivot legend.
for old in OUT.glob('pull-*.png'):
    old.unlink()
cases=[
 (1,0,0,'开盘直接出界 · 底线'),(1,0,1,'开盘直接出界 · 边线 1'),(1,1,0,'开盘直接出界 · 边线 2'),(1,1,1,'开盘直接出界 · 边线 3'),
 (2,0,0,'落地后滚出界 · 情形 1'),(2,0,1,'落地后滚出界 · 情形 2'),(2,1,0,'落地后滚出界 · 情形 3'),(2,1,1,'落地后滚出界 · 情形 4'),
 (3,0,0,'落在场内并停住'),(3,0,1,'触盘后滚出界 · 情形 1'),(3,1,0,'触盘后滚出界 · 情形 2'),(3,1,1,'在场内接住开盘'),
 (4,0,0,'界外接住开盘 · 底线'),(4,0,1,'界外接住开盘 · 边线'),
]
for n,(page,row,col,title) in enumerate(cases,1):
    name=f'pull-case-{n:02}'
    subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1500','-x',str(163+col*368),'-y',str(128+row*639),'-W','368','-H','639','-png',sys.argv[2],str(OUT/name)],check=True,stdout=subprocess.DEVNULL)
    entries.append({'id':name,'kind':'diagram','title':title,'en':'Pull Diagrams','description':'蓝色虚线：飞行路线；蓝色实线：滚动路线；红点：轴心位置。请结合第 7 章及图中具体情形核对。','refs':['7'],'aliases':[title,'开盘','pull','brick','开盘出界'],'image':f'wfdf/visuals/{name}.png','source':PULL+f'#page={page}'})
(ROOT/'dist/wfdf/visuals.json').write_text(json.dumps({'checked':'2026-10-25','license':'CC BY 4.0','author':'World Flying Disc Federation','entries':entries},ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Prepared {len(entries)} official illustration assets; no source PDFs deployed.')
