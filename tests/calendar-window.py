"""Calendar restoration preserves official cards and existing daily documents."""
import gzip,importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('seoul_only','scripts/seoul-only.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);data=root/'data';history=root/'history';history.mkdir();(data/'calendar').mkdir(parents=True)
    rows=[{'date':d,'venue':v,'race_no':n,'horses':[{'number':1}], 'official_result':{'pair':{'status':'confirmed','payouts':[{'numbers':[1,2],'odds':3}]}}} for d,v,n in [('20241018','seoul',1),('20241019','seoul',2),('20241019','seoul',1),('20241019','busan',1),('20251019','seoul',1)]]
    (history/'2024.jsonl.gz').write_bytes(gzip.compress(''.join(json.dumps({'race':r})+'\n' for r in rows).encode()))
    existing=data/'calendar'/'20251019.json';existing.write_text('preserve existing card')
    m.restore_calendar(data,history,'20241019')
    assert not (data/'calendar'/'20241018.json').exists()
    doc=json.loads((data/'calendar'/'20241019.json').read_text())
    assert doc['date']=='20241019' and [r['race_no'] for r in doc['races']]==[1,2]
    assert all(r['venue']=='seoul' for r in doc['races'])
    assert doc['races'][0]['official_result']==rows[2]['official_result']
    assert existing.read_text()=='preserve existing card'
    m.restore_calendar(data,history,'20241019')
    assert len(json.loads((data/'calendar'/'20241019.json').read_text())['races'])==2
print('PASS two-year calendar restoration, cutoff, Seoul-only, results, order and preservation')
