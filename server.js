require("dotenv").config();
const express=require("express"), axios=require("axios"), xml2js=require("xml2js"), path=require("path"), fs=require("fs");
const { Pool } = require("pg");
const app=express(), PORT=process.env.PORT||3000;
const XML_URL=process.env.NILAVIM_XML_URL;
const FILE_DB=path.join(__dirname,"orders.json");
const pool=process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes("render.com")?{rejectUnauthorized:false}:undefined}) : null;
const ADMIN_TOKEN=process.env.ADMIN_TOKEN;
const PUBLIC_URL=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
const IYZICO_READY=!!(process.env.IYZIPAY_API_KEY&&process.env.IYZIPAY_SECRET_KEY);
const iyzipay=IYZICO_READY?new Iyzipay({apiKey:process.env.IYZIPAY_API_KEY,secretKey:process.env.IYZIPAY_SECRET_KEY,uri:process.env.IYZIPAY_URI||'https://sandbox-api.iyzipay.com'}):null;
app.use(express.json());
function adminAuth(req,res,next){
 if(!ADMIN_TOKEN) return res.status(503).send("ADMIN_TOKEN yapılandırılmamış");
 if(req.headers.authorization!==`Bearer ${ADMIN_TOKEN}`) return res.status(401).send("Yetkisiz");
 next();
}
app.use(express.static(__dirname));
function fileLoad(){try{return JSON.parse(fs.readFileSync(FILE_DB,"utf8"))}catch{return []}}
function fileSave(x){fs.writeFileSync(FILE_DB,JSON.stringify(x,null,2))}
async function initDb(){
 if(!pool)return;
 await pool.query(`CREATE TABLE IF NOT EXISTS orders (
   id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL,
   customer JSONB NOT NULL, items JSONB NOT NULL, total NUMERIC(12,2) NOT NULL DEFAULT 0
 )`);
 const {rows}=await pool.query("SELECT COUNT(*)::int AS n FROM orders");
 if(rows[0].n===0){
   const old=fileLoad();
   for(const o of old){await pool.query("INSERT INTO orders(id,created_at,status,customer,items,total) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",[o.id,o.createdAt||new Date().toISOString(),o.status||"Yeni",o.customer||{},JSON.stringify(o.items||[]),Number(o.total||0)])}
 }
}
async function getOrders(){
 if(!pool)return fileLoad();
 const {rows}=await pool.query("SELECT id,created_at AS \"createdAt\",status,customer,items,total FROM orders ORDER BY created_at DESC");
 return rows.map(x=>({...x,total:Number(x.total)}));
}
async function getOrder(id){
 if(!pool)return fileLoad().find(x=>x.id===id);
 const {rows}=await pool.query("SELECT id,created_at AS \"createdAt\",status,customer,items,total FROM orders WHERE id=$1",[id]);
 return rows[0]?{...rows[0],total:Number(rows[0].total)}:null;
}
async function insertOrder(o){
 if(!pool){const orders=fileLoad();orders.push(o);fileSave(orders);return;}
 await pool.query("INSERT INTO orders(id,created_at,status,customer,items,total) VALUES($1,$2,$3,$4,$5,$6)",[o.id,o.createdAt,o.status,o.customer,JSON.stringify(o.items),Number(o.total||0)]);
}
async function updateStatus(id,status){
 if(!pool){const orders=fileLoad(),o=orders.find(x=>x.id===id);if(!o)return null;o.status=status;fileSave(orders);return o;}
 const {rows}=await pool.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,created_at AS \"createdAt\",status,customer,items,total",[status,id]);
 return rows[0]?{...rows[0],total:Number(rows[0].total)}:null;
}
function flat(v){if(v==null)return "";if(typeof v==="string"||typeof v==="number")return String(v);if(Array.isArray(v))return flat(v[0]);return v._?String(v._):""}
function first(o,ks){for(const k of ks)if(o&&o[k]!=null)return flat(o[k]);return ""}
app.get("/api/products",async(req,res)=>{
 if(!XML_URL)return res.status(503).json({error:"XML URL yok"});
 try{
  const r=await axios.get(XML_URL,{timeout:20000,responseType:"text"});
  const p=await xml2js.parseStringPromise(r.data,{explicitArray:true}), c=[];
  (function walk(x){if(!x||typeof x!=="object")return;if(Array.isArray(x))return x.forEach(walk);for(const k of Object.keys(x)){if(/^(urun|ürün|product|item)$/i.test(k)&&Array.isArray(x[k]))c.push(...x[k]);walk(x[k])}})(p);
  const products=c.map((x,i)=>{let cost=parseFloat(first(x,["price","fiyat","purchase_price","alis"]).replace(",","."))||0;let stock=parseFloat(first(x,["stock","stok","quantity","adet"]).replace(",","."))||0;return {id:first(x,["id","sku","barkod"])||String(i+1),name:first(x,["name","isim","urunadi","ürünadi","product_name","title"]),cost,stock,image:first(x,["image","resim","picture","image1","url"]),cat:first(x,["category","kategori","category_name"])||"Diğer",price:Math.round(cost*1.35*100)/100}}).filter(x=>x.name&&x.stock>0);
  res.json({products,count:products.length});
 }catch(e){res.status(502).json({error:"XML alınamadı",detail:e.message})}
});
app.get("/api/payment/config",(req,res)=>res.json({provider:IYZICO_READY?"iyzico":(process.env.PAYMENT_PROVIDER||"none"),ready:IYZICO_READY&&!!PUBLIC_URL,sandbox:(process.env.IYZIPAY_URI||"").includes("sandbox"),message:IYZICO_READY&&PUBLIC_URL?"iyzico Checkout Form hazır":"iyzico API anahtarı ve PUBLIC_URL yapılandırılmalı"}));
app.post("/api/payment/create",async(req,res)=>{
 const {orderId}=req.body||{}; const o=await getOrder(orderId);
 if(!o)return res.status(404).json({error:"Sipariş bulunamadı"});
 if(!iyzipay||!PUBLIC_URL)return res.status(503).json({error:"iyzico ödeme henüz yapılandırılmadı",orderId:o.id});
 const customer=o.customer||{}, parts=String(customer.name||"Müşteri").trim().split(/\s+/), surname=parts.length>1?parts.pop():"Müşteri", name=parts.join(" ")||"Müşteri";
 const address=String(customer.address||"Türkiye");
 const items=(o.items||[]).map((i,n)=>({id:String(i.id||('I'+n)),name:String(i.name||'Ürün').slice(0,100),category1:String(i.cat||'Genel').slice(0,50),category2:'Hediye',itemType:Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,price:(Number(i.price||0)*Number(i.qty||1)).toFixed(2)}));
 const total=Number(o.total||0).toFixed(2);
 const request={locale:Iyzipay.LOCALE.TR,conversationId:o.id,price:total,paidPrice:total,currency:Iyzipay.CURRENCY.TRY,basketId:o.id,paymentGroup:Iyzipay.PAYMENT_GROUP.PRODUCT,callbackUrl:PUBLIC_URL+'/api/payment/callback',enabledInstallments:[1,2,3,6,9],buyer:{id:o.id.slice(0,20),name,surname,gsmNumber:String(customer.phone||''),email:String(customer.email||'no-reply@example.com'),identityNumber:'11111111111',registrationAddress:address,city:'Turkey',country:'Turkey',zipCode:'00000',ip:req.ip||'127.0.0.1'},shippingAddress:{contactName:String(customer.name||'Müşteri'),city:'Turkey',country:'Turkey',address,zipCode:'00000'},billingAddress:{contactName:String(customer.name||'Müşteri'),city:'Turkey',country:'Turkey',address,zipCode:'00000'},basketItems:items};
 iyzipay.checkoutFormInitialize.create(request,(err,result)=>{if(err)return res.status(502).json({error:'iyzico bağlantı hatası'});if(result.status!=='success')return res.status(502).json({error:result.errorMessage||'Ödeme başlatılamadı'});res.json({ok:true,orderId:o.id,paymentPageUrl:result.paymentPageUrl,checkoutFormContent:result.checkoutFormContent,token:result.token});});
});
app.post('/api/payment/callback',express.urlencoded({extended:false}),async(req,res)=>{try{const token=req.body?.token;if(!token)return res.status(400).send('token yok');if(!iyzipay)return res.status(503).send('iyzico yapılandırılmadı');iyzipay.checkoutForm.retrieve({locale:Iyzipay.LOCALE.TR,conversationId:req.body?.conversationId||'',token},async(err,result)=>{if(err)return res.status(502).send('ödeme sorgulanamadı');const id=result.conversationId||req.body?.conversationId; if(result.paymentStatus==='SUCCESS'&&id){await updateStatus(id,'Ödendi');}res.redirect('/?payment='+(result.paymentStatus==='SUCCESS'?'success':'failed'));});}catch(e){res.status(500).send('callback hatası')}});
app.post("/api/orders",async(req,res)=>{try{const {customer,items,total}=req.body||{};if(!customer?.name||!customer?.phone||!customer?.address||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Eksik sipariş bilgisi"});const order={id:"HS"+Date.now(),createdAt:new Date().toISOString(),status:"Yeni",customer,items,total};await insertOrder(order);res.status(201).json({ok:true,orderId:order.id,status:order.status});}catch(e){res.status(500).json({error:"Sipariş kaydedilemedi"})}});
app.get("/api/orders",adminAuth,async(req,res)=>res.json({orders:await getOrders()}));
app.get("/api/admin/summary",adminAuth,async(req,res)=>{const orders=await getOrders();const revenue=orders.reduce((s,o)=>s+Number(o.total||0),0);const profit=orders.reduce((s,o)=>s+Number(o.items?.reduce((a,i)=>a+(Number(i.price||0)-Number(i.cost||0))*Number(i.qty||1),0)||0),0);res.json({orders:orders.length,revenue,profit,newOrders:orders.filter(o=>o.status==="Yeni").length})});
app.patch("/api/orders/:id",adminAuth,async(req,res)=>{const o=await updateStatus(req.params.id,req.body.status||"Yeni");if(!o)return res.status(404).json({error:"Sipariş yok"});res.json(o)});
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
initDb().then(()=>app.listen(PORT,()=>console.log("HediyeSepetim AI Pro "+PORT))).catch(e=>{console.error("DB başlatılamadı",e);process.exit(1)});
