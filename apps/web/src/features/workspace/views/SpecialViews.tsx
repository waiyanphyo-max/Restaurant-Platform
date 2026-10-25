/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import type { Row, View } from "@/types/workspace";
import { useWorkspaceContext } from "@/features/workspace/WorkspaceContext";

export function ApiWorkbenchView() {
  const {
    restaurantId,
    view,
    busy,
    orders,
    payments,
    addresses,
    devices,
    apiTool,
    setApiTool,
    responseData,
    setResponseData,
    restaurantPath,
    submitApi,
    intro,
    field,
  } = useWorkspaceContext();
      if (view === "api") return <>
        {intro("API workbench","Execute other documented backend routes from a structured request editor. Bearer authentication is included automatically for private routes; public routes do not require it.")}
        <section className="ws-card"><form className="ws-form-grid" onSubmit={submitApi}>{field("HTTP method",<select value={apiTool.method} onChange={(e)=>setApiTool({...apiTool,method:e.target.value})}>{["GET","POST","PUT","PATCH","DELETE"].map((m)=><option key={m}>{m}</option>)}</select>)}{field("Path",<input value={apiTool.path} onChange={(e)=>setApiTool({...apiTool,path:e.target.value})} required/>,true)}{["POST","PUT","PATCH"].includes(apiTool.method)&&field("JSON body",<textarea rows={8} value={apiTool.body} onChange={(e)=>setApiTool({...apiTool,body:e.target.value})} spellCheck={false}/>,true)}<button className="ws-btn ws-btn-primary" disabled={busy}>Send request</button></form></section>
        {responseData!==null&&<section className="ws-card"><div className="ws-card-heading"><h3>Last response</h3><button className="ws-btn ws-btn-muted" onClick={()=>setResponseData(null)}>Clear</button></div><pre className="ws-json-preview">{JSON.stringify(responseData,null,2)}</pre></section>}
        <section className="ws-card"><h3>Common API shortcuts</h3><div className="ws-endpoint-grid">{[["My restaurants","GET","/api/v1/my/restaurants"],["Public menu","GET","/api/v1/public/restaurants/"+restaurantId+"/menu"],["Order payments","GET",restaurantPath("orders/{orderId}/payments")],["Default driver","GET",restaurantPath("delivery-settings/default-driver")],["Customer addresses","GET","/api/v1/customer/addresses"],["Device registration","POST","/api/v1/devices"],["Settings","GET",restaurantPath("settings")],["Modifier groups","GET",restaurantPath("modifier-groups")],["Order history","GET","/api/v1/customer/orders?page=0&size=20"]].map(([name,method,path])=><button className="ws-endpoint" key={name} onClick={()=>setApiTool({method,path,body:"{}"})}><small>{method}</small><b>{name}</b><code>{path}</code></button>)}</div></section>
      </>;
  return null;
}

export function CreateRestaurantView() {
  const {
    restaurantCreate,
    setRestaurantCreate,
    createRestaurant,
    intro,
    field,
  } = useWorkspaceContext();
  
      return <>
        {intro("Create your restaurant","Create the first restaurant using the current authenticated user as OWNER. This action creates the initial settings and membership in one transaction.")}
        <section className="ws-card"><form className="ws-form-grid" onSubmit={createRestaurant}>{field("Restaurant name",<input value={restaurantCreate.name} onChange={(e)=>setRestaurantCreate({...restaurantCreate,name:e.target.value})} required/>)}{field("Public slug",<input value={restaurantCreate.slug} onChange={(e)=>setRestaurantCreate({...restaurantCreate,slug:e.target.value})} placeholder="Auto-generated if blank"/>)}{field("Phone",<input value={restaurantCreate.phone} onChange={(e)=>setRestaurantCreate({...restaurantCreate,phone:e.target.value})}/>)}{field("Description",<input value={restaurantCreate.description} onChange={(e)=>setRestaurantCreate({...restaurantCreate,description:e.target.value})}/>)}{field("Address",<input value={restaurantCreate.address} onChange={(e)=>setRestaurantCreate({...restaurantCreate,address:e.target.value})} />,true)}{field("House / building",<input value={restaurantCreate.houseNo} onChange={(e)=>setRestaurantCreate({...restaurantCreate,houseNo:e.target.value})}/>)}{field("Street",<input value={restaurantCreate.street} onChange={(e)=>setRestaurantCreate({...restaurantCreate,street:e.target.value})}/>)}{field("Ward",<input value={restaurantCreate.ward} onChange={(e)=>setRestaurantCreate({...restaurantCreate,ward:e.target.value})}/>)}{field("Township",<input value={restaurantCreate.township} onChange={(e)=>setRestaurantCreate({...restaurantCreate,township:e.target.value})} required/>)}{field("City",<input value={restaurantCreate.city} onChange={(e)=>setRestaurantCreate({...restaurantCreate,city:e.target.value})} required/>)}{field("Currency",<select value={restaurantCreate.currency} onChange={(e)=>setRestaurantCreate({...restaurantCreate,currency:e.target.value})}><option value="MMK">MMK</option><option value="THB">THB</option><option value="USD">USD</option></select>)}{field("Timezone",<input value={restaurantCreate.timezone} onChange={(e)=>setRestaurantCreate({...restaurantCreate,timezone:e.target.value})} required/>)}<p className="ws-muted">The signed-in user becomes OWNER. The default currency is MMK and timezone is Asia/Yangon.</p><button className="ws-btn ws-btn-primary">Create restaurant</button></form></section>
      </>;
}
