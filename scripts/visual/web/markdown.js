export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=value=>value.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')||'section';

export function renderMarkdown(markdown,{projectId,assets={},routeForDocument=()=>null}={}) {
  if(!window.markdownit||!window.DOMPurify)throw new Error('阅读组件加载失败，请检查小说书房安装是否完整。');
  const md=window.markdownit({html:false,linkify:false,typographer:false});
  /* 中文正文常按排版习惯在句中硬换行：软换行直接接排，不留半角空格（默认行为会在字缝里塞空格） */
  md.renderer.rules.softbreak=()=>'';
  const occurrences=new Map();
  md.renderer.rules.heading_open=(tokens,index)=>{
    const base=slug(tokens[index+1]?.content||'section');const count=(occurrences.get(base)||0)+1;occurrences.set(base,count);
    tokens[index].attrSet('id',count===1?base:`${base}-${count}`);
    return md.renderer.renderToken(tokens,index,{});
  };
  md.renderer.rules.image=(tokens,index)=>{
    const token=tokens[index],source=token.attrGet('src');
    const normalize=value=>{try{return encodeURI(decodeURIComponent(value));}catch{return value;}};
    const asset=Object.hasOwn(assets,source)?assets[source]:Object.entries(assets).find(([key])=>normalize(key)===normalize(source))?.[1];
    if(!asset)return `<span class="image-unavailable">[图片未加载：${escapeHtml(token.content||source)}]</span>`;
    return `<img src="/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset)}" alt="${escapeHtml(token.content)}" loading="lazy">`;
  };
  const defaultOpen=md.renderer.rules.link_open||((tokens,index,options,env,self)=>self.renderToken(tokens,index,options));
  md.renderer.rules.link_open=(tokens,index,options,env,self)=>{
    const token=tokens[index],href=token.attrGet('href')||'';
    if(/^https?:\/\//i.test(href)){token.attrSet('target','_blank');token.attrSet('rel','noopener noreferrer');}
    else if(href.startsWith('#')){let hash=href.slice(1);try{hash=decodeURIComponent(hash);}catch{}token.attrSet('href',`#${slug(hash)}`);token.attrSet('data-heading-link','true');}
    else {
      const route=routeForDocument(href);
      if(route)token.attrSet('href',route);else {token.attrSet('href','#');token.attrSet('data-unavailable-link','true');}
    }
    return defaultOpen(tokens,index,options,env,self);
  };
  return window.DOMPurify.sanitize(md.render(markdown),{FORBID_TAGS:['style','form','input','svg','math','iframe'],FORBID_ATTR:['style']});
}
