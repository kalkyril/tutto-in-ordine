import json,re,html,hashlib,argparse
parser=argparse.ArgumentParser(description='Ricostruisce le tabelle dai due allegati HTML della Gazzetta Ufficiale; richiede file locali ufficiali, nessuna rete.')
parser.add_argument('--dm2014',required=True);parser.add_argument('--dm2022',required=True);args=parser.parse_args()
from pathlib import Path
out={'fonte':'Tabelle normative del D.M. 55/2014 e del D.M. 147/2022; elaborazione locale TIO','pagina':'https://www.gazzettaufficiale.it/eli/id/2022/10/08/22G00157/sg','scaricato_il':'2026-10-14','variazione':{'2014':[50,80],'2022':[50,50]},'competenze':[],'tabelle':{'2014':{},'2022':{}},'fonti':[]}
# Codici conservati solo per la compatibilità dei documenti salvati nelle versioni precedenti.
mapping={'1':[100],'2':[110],'3':[120],'4':[130],'5':[140],'6':[150],'7':[160],'8':[170],'9':[180],'10':[190],'11':[200],'12':[210],'13':[220,230],'14':[240,250,260],'16':[270],'17':[280],'18':[290],'19':[300],'20':[310],'20-bis':[390],'21':[320],'22':[330],'22-bis':[335],'23':[340],'24':[350],'25':[360],'25-bis':[380],'26':[370]}
phaseCodes={'6':['99'],'7':['99'],'8':['99'],'9':['10','20','30'],'13':['10','20','40'],'16':['20','80'],'17':['20','80'],'18':['10','30'],'19':['99'],'20':['99'],'25':['99'],'25-bis':['110','120','130'],'26':['99'],'22-bis':['10','20','30','40','50']}
phaseNames={'10':'Studio','20':'Introduttiva','30':'Istruttoria / trattazione','40':'Decisionale','50':'Cautelare','60':'Istruttoria / dibattiment.','70':'Cautelare','72':'Cautelare collegiale','74':'Cautelare monocratica','80':'Trattazione e conclusione','99':'Compenso','110':'Attivazione','120':'Negoziazione','130':'Conciliazione'}
customNames={220:'Corte di Cassazione',230:'Giurisdizioni superiori',240:'Corte costituzionale',250:'Corte europea',260:'Corte di giustizia UE',335:'Consiglio di Stato — appello cautelare',340:'Giustizia tributaria — primo grado',350:'Giustizia tributaria — secondo grado'}
for year in [2014,2022]:
 raw=Path(args.dm2014 if year==2014 else args.dm2022).read_bytes();text=html.unescape(re.sub('<[^>]*>','',raw.decode()));text=re.sub(r'(20|22)[ -]+[Bb][Ii][Ss]\.',lambda m:m[1]+'-bis.',text)
 chunks=re.split(r'\n\s*(\d+(?:-bis)?)\.\s+([A-Z][^\n]+)',text)
 bases={}
 for i in range(1,len(chunks),3):
  key,title,body=chunks[i:i+3];rows=[]
  for line in body.splitlines():
   if not line.lstrip().startswith('|'):continue
   cells=line.strip().strip('|').split('|');cols=cells[1:]
   if not cells[0].strip() or cells[0].strip().lower()=='valore':continue
   if cols and any(re.fullmatch(r'\s*[\d.]+,\d{2}\s*',v) for v in cols) and all(not v.strip() or re.fullmatch(r'\s*[\d.]+,\d{2}\s*',v) for v in cols): rows.append([float(v.strip().replace('.','').replace(',','.')) if v.strip() else None for v in cols])
  bases[key]=rows
  if key=='15':continue
  if key not in mapping: raise ValueError('Tabella non mappata '+key)
  if key in ['21','22','23','24']: phaseCodes[key]=['10','20','50','40','72','74'] if year==2022 and key=='21' else ['10','20','50','40','70','80'] if year==2022 and key=='22' else ['10','20','50','40','70']
  codes=phaseCodes.get(key,['10','20','30','40']+(['50','80'] if key in ['21','22'] and year==2022 else ['50'] if key in ['21','22','23','24'] else []))
  if len(rows)!=len(codes):raise ValueError((year,key,len(rows),codes))
  if len(rows[0]) not in [3,4,5,6]: raise ValueError((year,key,rows))
  for cod in mapping[key]:
   if year==2022:out['competenze'].append({'ambito':'stragiudiziale' if cod in [360,380] else 'civile','cod':cod,'nome':customNames.get(cod,title.strip().capitalize()),'tabella':key})
   fasi=[{'cod':c,'nome':('Istruttoria / trattazione' if c=='50' else 'Appello cautelare' if c=='80' and key=='22' else phaseNames.get(c,'Appello cautelare'))} for c in codes]
   cols=len(rows[0]);limits=[1100,5200,26000,52000,260000,520000] if cols in [3,6] else [5200,26000,52000,260000,520000] if cols==5 else [26000,52000,260000,520000]
   limits=limits[:cols]
   ids=[(j+1)*10 for j in range(cols)] if cols in [3,6] else [20,30,40,50,60] if cols==5 else [30,40,50,60]
   def terna(n,phase=''):
    istruttoria=year==2014 and cod<500 and phase in ['30','50']
    return [int(n*(.3 if istruttoria else .5)+.5),int(n),int(n*(2 if istruttoria else 1.8 if year==2014 else 1.5)+.5)]
   sc=[]
   for j,limit in enumerate(limits):
    label='Fino a € '+f'{limit:,}'.replace(',','.') if j==0 else 'Da € '+f'{limits[j-1]+1:,}'.replace(',','.')+' a € '+f'{limit:,}'.replace(',','.')
    sc.append({'id':ids[j],'label':label,'valori':{c:terna(rows[k][j],c) for k,c in enumerate(codes)}})
   if limits[-1]==520000:
    if cod==360 and year==2022:sc.append({'id':140,'label':'Oltre € 520.000','calcolato':True})
    else:
     current=[r[-1] for r in rows];prev=520000
     for j,limit in enumerate([1000000,2000000,4000000,8000000,16000000,32000000]):
      # Art. 6: crescita del 30% per gli scaglioni successivi (valori arrotondati all'euro).
      current=[int(v*1.3+.5) for v in current];sc.append({'id':70+j*10,'label':f'Da € {prev+1:,} a € {limit:,}'.replace(',','.'),'valori':{c:terna(current[k],c) for k,c in enumerate(codes)}});prev=limit
     sc.append({'id':130,'label':'Oltre € 32.000.000 — inserimento manuale','calcolato':True})
    # Indeterminabili: qui restano vuoti, li calcola electron/tariffe.js dagli scaglioni vicini come i calcolatori del sito.
    for ident,label in [(901,'Indeterminabile — valutazione manuale'),(902,'Indeterminabile — valutazione manuale'),(903,'Indeterminabile — valutazione manuale'),(910,'Indeterminabile di particolare importanza — valutazione manuale')]:sc.append({'id':ident,'label':label,'calcolato':True})
   out['tabelle'][str(year)][str(cod)]={'fasi':fasi,'scaglioni':sc}
 out['fonti'].append({'anno':year,'url':'https://www.gazzettaufficiale.it/eli/id/'+('2022/10/08/22G00157' if year==2022 else '2014/04/02/14G00067')+'/sg','sha256_html':hashlib.sha256(raw).hexdigest()})
 # Tabella 15 (colonne vuote = fase non prevista); lettura dal PDF ufficiale.
 matrix=([[378,851,851,378,378,378,851,851,473,473,756,473,315,473,756,945,945],[473,662,None,None,1229,1229,756,756,567,756,1418,945,378,945,1985,2646,2646],[756,1040,1418,473,None,None,1040,1040,1134,1418,2363,1418,None,1418,2268,None,None],[662,1229,None,709,1418,1418,1418,1418,1418,1418,2835,1418,945,1418,2336,2741,2741]] if year==2022 else [[360,810,810,360,360,810,810,450,450,720,450,450,720,900,900],[450,630,None,1170,1170,720,720,540,720,1350,900,900,1890,2520,2520],[720,990,1350,None,None,990,990,1080,1350,2250,1350,1350,2160,None,None],[630,1170,None,1350,1350,1350,1350,1350,1350,2700,1350,1350,2225,2610,2610]])
 penal=[(500,'Giudice di pace'),(510,'Indagini preliminari'),(520,'Indagini difensive')]+([(525,"Convalida dell'arresto")] if year==2022 else [])+[(530,'Cautelari personali'),(540,'Cautelari reali'),(550,'GIP'),(560,'GUP'),(570,'Tribunale monocratico'),(580,'Tribunale collegiale'),(590,"Corte d'assise"),(610,'Tribunale di sorveglianza')]+([(615,'Magistrato di sorveglianza')] if year==2022 else [])+[(600,"Corte d'appello"),(620,"Corte d'assise d'appello"),(630,'Corte di cassazione'),(640,'Giurisdizioni superiori')]
 for j,(cod,name) in enumerate(penal):
  if year==2022:out['competenze'].append({'cod':cod,'nome':name,'ambito':'penale','tabella':'15'})
  codes=['10','20','60','90'];phaseNames['90']='Decisionale';valid=[(k,c) for k,c in enumerate(codes) if matrix[k][j] is not None]
  out['tabelle'][str(year)][str(cod)]={'fasi':[{'cod':c,'nome':phaseNames[c]} for k,c in valid],'scaglioni':[],'fisse':{c:terna(matrix[k][j]) for k,c in valid}}
# Art. 4 comma 10-ter: studio + introduttiva + 50% della decisionale.
t=out['tabelle']['2022']['330']
out['tabelle']['2022']['335']={'fasi':[f for f in t['fasi'] if f['cod'] in ['10','20','40']],'scaglioni':[]}
for sc in t['scaglioni']:
 entry={k:v for k,v in sc.items() if k!='valori'}
 if 'valori' in sc:entry['valori']={c:[round(v*(.5 if c=='40' else 1),2) for v in sc['valori'][c]] for c in ['10','20','40']}
 out['tabelle']['2022']['335']['scaglioni'].append(entry)
out['competenze'].append({'cod':335,'nome':'Consiglio di Stato — appello cautelare','ambito':'civile','tabella':'22'})
Path('electron/data/tariffe-dm55.json').write_text(json.dumps(out,ensure_ascii=False,indent=1)+'\n')
print('Tabelle indipendenti:',len(out['competenze']),{y:len(t) for y,t in out['tabelle'].items()})
