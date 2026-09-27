"""Fill missing Seoul trio dividends from official result reports, before packing history."""
import gzip,json,re,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen,Request
from history_payouts import dividends

def winners(result):
    payouts=result.get('pair',{}).get('payouts',[])
    ns=sorted({int(n) for p in payouts for n in p['numbers']})
    return [tuple(ns)] if len(ns)==3 else None

def collect(item):
    date,cards=item
    cache=Path('training/trio-reports')/(date+'.txt.gz')
    try:
        if cache.exists():text=gzip.decompress(cache.read_bytes()).decode()
        else:
            url=f'https://race.kra.co.kr/dbdata/fileDownLoad.do?fn=chollian/seoul/jungbo/rcresult/{date}dacom11.rpt&meet=1'
            with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as response:raw=response.read()
            try:text=raw.decode('utf-8')
            except UnicodeDecodeError:text=raw.decode('cp949')
            if not re.search(r'배당률\s+단:',text):raise ValueError('No official dividend report')
            cache.parent.mkdir(parents=True,exist_ok=True);cache.write_bytes(gzip.compress(text.encode(),mtime=0))
        blocks={}
        for block in re.split(r'(?=제목\s*:\s*\d{2,4}년)',text):
            m=re.search(r'제목\s*:\s*(\d{2,4})년\s*(\d+)월\s*(\d+)일.*?제\s*(\d+)경주',block)
            if m:
                y,mo,d,rn=map(int,m.groups());y+=2000 if y<100 else 0
                if f'{y:04d}{mo:02d}{d:02d}'!=date:raise ValueError('Report date mismatch')
                blocks[rn]=block
        count=0
        for card in cards:
            result=card['official_result'];expected=winners(result)
            if not expected:continue # Do not infer ambiguous dead-heat winners.
            try:market=dividends(blocks.get(int(card['race_no']),''),'trio',expected)
            except ValueError:continue
            result['trio']=market;count+=1
        return count,None
    except Exception as error:return 0,f'{date}: {error}'

def main():
    docs={p:json.loads(p.read_text()) for p in [*Path('data/calendar').glob('????????.json'),Path('data/latest.json')] if p.exists()}
    grouped={}
    for doc in docs.values():
        for r in doc.get('races',[]):
            result=r.get('official_result',{})
            if r.get('venue')!='seoul' or result.get('trio',{}).get('status')=='confirmed' or result.get('pair',{}).get('status')!='confirmed':continue
            if winners(result):grouped.setdefault(r['date'],[]).append(r)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(collect,grouped.items()))
    for path,doc in docs.items():path.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')))
    errors=[e for _,e in results if e]
    print('Official trio payouts recovered:',sum(n for n,_ in results),'pending report days:',len(errors),flush=True)
    for error in errors[:10]:print(error,flush=True)
if __name__=='__main__':main()
