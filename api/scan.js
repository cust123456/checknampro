const UA='Mozilla/5.0 DomainHistoryChecker/1.0';
const TOPICS={
  'Bet/Casino':['casino','betting','sportsbook','slot','poker','jackpot','odds','wager','baccarat','roulette','cá cược','nhà cái','xổ số','bắn cá'],
  'Blog/News':['blog','news','article','magazine','editorial','post','category','tin tức','bài viết'],
  'Shop/Ecommerce':['shop','store','product','cart','checkout','ecommerce','price','buy now','mua hàng','sản phẩm'],
  'Business/Company':['company','business','services','solutions','contact us','about us','corporate','agency'],
  'Education':['school','university','college','course','student','education','academy','training'],
  'Tech/Software':['software','developer','hosting','cloud','app','technology','github','api','saas'],
  'Forum/Community':['forum','community','member','thread','discussion','register','login'],
  'Adult':['porn','xxx','adult','sex','escort','camgirl']
};
async function get(url){const r=await fetch(url,{headers:{'user-agent':UA},redirect:'follow'});if(!r.ok)throw new Error('Wayback '+r.status);return r}
async function cdx(domain,sort,limit=1){const u=`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain+'/*')}&output=json&matchType=host&fl=timestamp&filter=statuscode:200&filter=mimetype:text/html&sort=${sort}&limit=${limit}`;return get(u).then(r=>r.json())}
function textOf(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').slice(0,30000)}
function titleOf(html){return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,140)}
function classify(text){const t=text.toLowerCase();let scored=Object.entries(TOPICS).map(([k,words])=>[k,words.reduce((n,w)=>n+(t.includes(w)?1:0),0)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);return scored.length?scored.slice(0,2).map(x=>x[0]).join(' + '):'Khác/Không rõ'}
async function snap(domain,ts){const url=`https://web.archive.org/web/${ts}id_/http://${domain}/`;try{const r=await get(url);const html=await r.text();return {year:ts.slice(0,4),title:titleOf(html),text:textOf(html)}}catch{return null}}
module.exports = async function handler(req,res){
  const domain=String(req.query.domain||'').trim().toLowerCase().replace(/^www\./,'');
  if(!/^(?=.{1,253}$)(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.)+[a-z]{2,}$/i.test(domain))return res.status(400).json({error:'Domain không hợp lệ'});
  try{
    const [first,last] = await Promise.all([cdx(domain,'ascending'),cdx(domain,'descending')]);
    const a=first?.[1]?.[0], b=last?.[1]?.[0]; if(!a||!b)return res.json({domain,years:'—',firstYear:'—',lastYear:'—',totalSnapshots:0,topic:'Không có lịch sử',description:'Không tìm thấy snapshot HTML 200 trên Wayback.'});
    const firstYear=a.slice(0,4), lastYear=b.slice(0,4), years=`${Math.max(0,+lastYear-+firstYear)} năm`;
    let totalSnapshots=0;try{const u=`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain+'/*')}&output=json&matchType=host&fl=timestamp&filter=statuscode:200&filter=mimetype:text/html&collapse=digest&limit=2000`;const j=await get(u).then(r=>r.json());totalSnapshots=Math.max(0,(j?.length||1)-1)}catch{}
    let timestamps=[a,b];
    try{const mid=await cdx(domain,'ascending',40);if(mid?.length>2)timestamps.splice(1,0,mid[Math.floor((mid.length-1)/2)][0])}catch{}
    timestamps=[...new Set(timestamps)].slice(0,3);const snaps=(await Promise.all(timestamps.map(ts=>snap(domain,ts)))).filter(Boolean);
    const merged=snaps.map(x=>`${x.title} ${x.text}`).join(' ');const topic=classify(merged);const titles=snaps.filter(x=>x.title).map(x=>`${x.year}: ${x.title}`).slice(0,3);
    const description=titles.length?titles.join(' | '):`Có snapshot từ ${firstYear} đến ${lastYear}, nhưng không đọc được title rõ ràng.`;
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');return res.json({domain,years,firstYear,lastYear,totalSnapshots,topic,description});
  }catch(e){return res.status(500).json({error:e.message||'Không thể quét Wayback'})}
}
