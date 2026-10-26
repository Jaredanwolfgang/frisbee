"""Local-only OpenAI-compatible fixture; never use as a real AI provider."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import time


def sample_plan():
    return {'status':'ready','name':'三人角标传接','summary':'O1 出盘给切入的 O2，再接 O2 的回盘。','assumptions':['角标距离仅作示意'],
            'players':[{'id':1,'team':'offense','x':200,'y':280},{'id':2,'team':'offense','x':600,'y':120},{'id':3,'team':'offense','x':600,'y':430}],
            'disc_holder':1,'markers':[{'x':750,'y':250,'label':'接盘点'},{'x':450,'y':350,'label':'回传点'}],
            'steps':[{'name':'第一传','notes':'O2 切向接盘点，接 O1 的盘。','moves':[{'player':2,'x':750,'y':250,'via':[]}],'pass':{'from':1,'to':2}},
                     {'name':'回传','notes':'O1 移至回传点，接 O2 的盘。','moves':[{'player':1,'x':450,'y':350,'via':[]}],'pass':{'from':2,'to':1}}]}


def sample_outline():
    return {'name':'三人角标传接','roles':[{'label':'O1','description':'口述中先拿盘的人'},{'label':'O2','description':'先向前跑去接盘的人'},{'label':'O3','description':'留在旁边等待的人'}],
            'setup':'O1 在后方持盘；O2 在前方准备切入；O3 在一侧等待。',
            'steps':['O2 向前切入接 O1 的传盘；O1 和 O3 原地。','O1 出盘后向前跑，接 O2 的回传；O2 和 O3 原地。'],
            'markers':['接盘点：O2 第一传接盘位置。','回传点：O1 第二传接盘位置。'],
            'ending':'完成两次传盘后结束，不自动循环。','assumptions':['按提及顺序对应 O1、O2、O3。'],'questions':[]}


class Fixture(BaseHTTPRequestHandler):
    def do_POST(self):
        data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if data.get('stream'):
            self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
            for text in ['无争议的防守违反规则后，','读秒从 1 重新开始，','不是从 4 或 6 开始。[9.5.1]']:
                event={'choices':[{'delta':{'content':text},'finish_reason':None}]}
                self.wfile.write(('data: '+json.dumps(event,ensure_ascii=False)+'\n\n').encode());self.wfile.flush();time.sleep(.05)
            self.wfile.write(b'data: [DONE]\n\n')
        else:
            payload={'choices':[{'message':{'content':json.dumps(sample_outline() if json.loads(data['messages'][-1]['content']).get('operation')=='outline' else sample_plan(),ensure_ascii=False)},'finish_reason':'stop'}]}
            raw=json.dumps(payload,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def log_message(self,*args):pass


if __name__=='__main__':
    print('Local fixture: http://127.0.0.1:4176/v1',flush=True)
    ThreadingHTTPServer(('127.0.0.1',4176),Fixture).serve_forever()
