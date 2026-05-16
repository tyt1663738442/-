import requests

r = requests.get('https://hq.sinajs.cn/list=sh600519,sz000001', headers={
    'Referer': 'https://finance.sina.com.cn',
    'User-Agent': 'Mozilla/5.0'
}, timeout=10)
r.encoding = 'gbk'
lines = r.text.strip().split('\n')
for line in lines:
    if '=' not in line or 'hq_str' not in line:
        continue
    key = line.split('hq_str_')[1].split('=')[0]
    print('key:', key)
    parts = line.split('"')[1].split(',')
    print('parts count:', len(parts))
    for i, p in enumerate(parts):
        print(f'  [{i}]={p}')
