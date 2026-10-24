export function validTimeZone(value){try{if(typeof value!=='string'||value.length>80)return false;new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}}
export function calculateStreak(timestamps,now=Date.now(),timeZone='Asia/Kolkata'){
 const formatter=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const day=at=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(at)).map(p=>[p.type,p.value]));return Math.floor(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/86400000);};
 const today=day(now),days=[...new Set(timestamps.filter(t=>Number.isFinite(t)&&t<=now).map(day))].sort((a,b)=>a-b),set=new Set(days);
 let best=0,run=0,previous=null;for(const d of days){run=previous===d-1?run+1:1;best=Math.max(best,run);previous=d;}
 let current=0,cursor=set.has(today)?today:today-1;while(set.has(cursor)){current++;cursor--;}
 return {current,best,completedToday:set.has(today),timeZone,week:Array.from({length:7},(_,i)=>{const d=today-6+i;return {date:new Date(d*86400000).toISOString().slice(0,10),completed:set.has(d),today:d===today};})};
}
