# Convierte questions/src/*.txt (formato simple) a questions/*.json
import json,glob,os,sys
base=os.path.join(os.path.dirname(__file__),'..','questions')
ok=True
for f in sorted(glob.glob(base+'/src/*.txt')):
    lv=os.path.basename(f)[:-4]; sec=None; out={'parts':{},'questions':[],'golden':[]}
    for n,line in enumerate(open(f,encoding='utf8'),1):
        line=line.strip()
        if not line: continue
        if line.startswith('#PARTS'): sec='p'; continue
        if line.startswith('#QUESTIONS'): sec='q'; continue
        if line.startswith('#GOLDEN'): sec='g'; continue
        if line.startswith('#'): continue
        c=[x.strip() for x in line.split(' | ')]
        if sec=='p': out['parts'][c[0]]={'name':c[1],'m':float(c[2])}
        elif sec=='q':
            if len(c)!=6 or len(set(c[2:]))!=4 or c[0] not in out['parts']: print('BAD',lv,n,line); ok=False; continue
            out['questions'].append({'part':c[0],'q':c[1],'o':c[2:],'a':0})
        elif sec=='g':
            if len(c)!=3 or c[0] not in out['parts']: print('BAD',lv,n,line); ok=False; continue
            out['golden'].append({'part':c[0],'q':c[1],'a':[a.strip() for a in c[2].split(' / ')]})
    json.dump(out,open(f'{base}/{lv}.json','w',encoding='utf8'),ensure_ascii=False,indent=0)
    from collections import Counter
    print(lv,len(out['questions']),'normal',len(out['golden']),'golden',dict(Counter(q['part'] for q in out['questions'])))
sys.exit(0 if ok else 1)
