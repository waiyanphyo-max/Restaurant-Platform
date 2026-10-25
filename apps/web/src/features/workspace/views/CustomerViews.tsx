/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import type { Row, View } from "@/types/workspace";
import { useWorkspaceContext } from "@/features/workspace/WorkspaceContext";
import { CustomerAvatar } from "@/components/customer/CustomerAvatar";

export function TableOrderView() {
  const {
    token,
    restaurantId,
    setRestaurantId,
    view,
    busy,
    categories,
    products,
    publicMenu,
    tableQrToken,
    setTableQrToken,
    tableQrResult,
    setTableQrResult,
    cart,
    setCart,
    checkout,
    tracking,
    loadTableMenu,
    placeTableQrOrder,
    intro,
    empty,
    field,
    activeCartItems,
    cartTotal,
    list,
    label,
    asMoney,
  } = useWorkspaceContext();
      if (view === "table-order") {
        const menuCategories = list(publicMenu.categories);
        return <>
          {intro("Dine-in · Table QR","Guest checkout for the table QR token. No customer account is required; token, availability, modifiers, stock and prices are checked by the backend.")}
          <section className="ws-card"><form className="ws-form-grid" onSubmit={loadTableMenu}>{field("Restaurant UUID",<input value={restaurantId} onChange={(e)=>setRestaurantId(e.target.value)} required placeholder="Restaurant UUID from the printed QR link"/>)}{field("Table QR token",<input value={tableQrToken} onChange={(e)=>setTableQrToken(e.target.value)} required placeholder="Paste or scan the table token"/>,true)}<button className="ws-btn ws-btn-primary">Load menu</button></form></section>
          {tableQrResult.id && <section className="ws-card ws-tracking-status"><span className="ws-eyebrow">ORDER SUBMITTED</span><strong>{String(tableQrResult.orderNumber||"Order received")}</strong><span className="ws-status">{String(tableQrResult.status||"PENDING")}</span><p>Table order submitted. Ask staff for an update if needed.</p><button className="ws-btn ws-btn-muted" onClick={()=>setTableQrResult({})}>Start another order</button></section>}
          {menuCategories.map((category)=><section className="ws-store-category" key={String(category.id)}><h3>{label(category)}</h3><div className="ws-product-grid">{list(category.products).filter((p)=>p.available!==false).map((p)=>{const key=String(p.id);const item=cart[key]||{quantity:0,variantId:"",specialInstruction:"",modifiers:{}};return <article className="ws-product" key={key}>{p.imageUrl?<img src={String(p.imageUrl)} alt={String(p.name)}/>:<div className="ws-product-placeholder">MENU</div>}<div className="ws-product-body"><b>{label(p)}</b><p>{String(p.description||"")}</p><strong>{asMoney(p.price,String(publicMenu.currency||"MMK"))}</strong>{list(p.variants).length>0&&field("Variant",<select value={item.variantId} onChange={(e)=>setCart({...cart,[key]:{...item,variantId:e.target.value}})}><option value="">Default</option>{list(p.variants).filter((v)=>v.available!==false).map((v)=><option key={String(v.id)} value={String(v.id)}>{label(v)} · {asMoney(v.price,String(publicMenu.currency||"MMK"))}</option>)}</select>)}{list(p.modifierGroups).map((g)=><div className="ws-modifier-box" key={String(g.id)}><small>{label(g)}{g.required?" · Required":""}</small>{list(g.options).filter((o)=>o.available!==false).map((o)=><label className="ws-check-row" key={String(o.id)}><input type="checkbox" checked={Number(item.modifiers[String(o.id)]||0)>0} onChange={(e)=>setCart({...cart,[key]:{...item,modifiers:{...item.modifiers,[String(o.id)]:e.target.checked?1:0}}})}/><span>{label(o)} {Number(o.additionalPrice||0)? "(+"+asMoney(o.additionalPrice,String(publicMenu.currency||"MMK"))+")":""}</span></label>)}</div>)}{field("Special instruction",<input value={item.specialInstruction} onChange={(e)=>setCart({...cart,[key]:{...item,specialInstruction:e.target.value}})} placeholder="Optional"/>) }<div className="ws-store-add"><div className="ws-quantity"><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(0,item.quantity-1)}})}>−</button><b>{item.quantity}</b><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.min(99,item.quantity+1)}})}>＋</button></div><button className="ws-btn ws-btn-primary" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(1,item.quantity)}})}>Add</button></div></div></article>})}</div></section>)}
          {menuCategories.length>0&&<section className="ws-card ws-cart"><div className="ws-cart-total"><span>Estimated subtotal</span><strong>{asMoney(cartTotal,String(publicMenu.currency||"MMK"))}</strong></div><p className="ws-muted">The server calculates the final total. This is a guest table order, not a delivery checkout.</p><button className="ws-btn ws-btn-primary ws-btn-block" disabled={busy||!tableQrToken.trim()||!activeCartItems.length} onClick={()=>void placeTableQrOrder()}>Place table order</button></section>}
          {!menuCategories.length&&empty("Load a menu with a valid restaurant UUID first.")}
        </>;
      }
  return null;
}

export function StorefrontView() {
  const {
    restaurantName,
    view,
    busy,
    categories,
    products,
    addresses,
    customerZones,
    publicMenu,
    search,
    setSearch,
    cart,
    setCart,
    checkout,
    setCheckout,
    loadView,
    changeView,
    placeDeliveryOrder,
    empty,
    field,
    activeCartItems,
    cartTotal,
    list,
    label,
    asMoney,
  } = useWorkspaceContext();
      if (view === "storefront") {
        const categories = list(publicMenu.categories);
        return <>
          <div className="ws-storefront-banner"><div>{publicMenu.logoUrl?<img src={String(publicMenu.logoUrl)} alt=""/>:<span className="ws-storefront-logo">R</span>}<div><div className="ws-eyebrow">CUSTOMER STORE</div><h2>{String(publicMenu.restaurantName||restaurantName)}</h2><p>{String(publicMenu.description||"Browse menu and order delivery.")}</p></div></div><span className="ws-status">Delivery</span></div>
          <div className="ws-store-layout"><div className="ws-store-products"><div className="ws-toolbar"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search menu…"/><button className="ws-btn ws-btn-muted" onClick={()=>loadView("storefront")}>Refresh</button></div>{categories.map((c)=><section className="ws-store-category" key={String(c.id)}><h3>{label(c)}</h3><div className="ws-product-grid">{list(c.products).filter((p)=>p.available!==false&&JSON.stringify(p).toLowerCase().includes(search.toLowerCase())).map((p)=>{const key=String(p.id);const item=cart[key]||{quantity:0,variantId:"",specialInstruction:"",modifiers:{}};return <article className="ws-product" key={key}>{p.imageUrl?<img src={String(p.imageUrl)} alt={String(p.name)}/>:<div className="ws-product-placeholder">MENU</div>}<div className="ws-product-body"><b>{label(p)}</b><p>{String(p.description||"")}</p><strong>{asMoney(p.price,String(publicMenu.currency||"MMK"))}</strong>{list(p.variants).length>0&&field("Variant",<select value={item.variantId} onChange={(e)=>setCart({...cart,[key]:{...item,variantId:e.target.value}})}><option value="">Default</option>{list(p.variants).filter((v)=>v.available!==false).map((v)=><option key={String(v.id)} value={String(v.id)}>{label(v)} · {asMoney(v.price,String(publicMenu.currency||"MMK"))}</option>)}</select>)}{list(p.modifierGroups).map((g)=><div className="ws-modifier-box" key={String(g.id)}><small>{label(g)}{g.required?" · Required":""}</small>{list(g.options).filter((o)=>o.available!==false).map((o)=><label className="ws-check-row" key={String(o.id)}><input type="checkbox" checked={Number(item.modifiers[String(o.id)]||0)>0} onChange={(e)=>setCart({...cart,[key]:{...item,modifiers:{...item.modifiers,[String(o.id)]:e.target.checked?1:0}}})}/><span>{label(o)}{Number(o.additionalPrice||0)? " (+"+asMoney(o.additionalPrice,String(publicMenu.currency||"MMK"))+")":""}</span></label>)}</div>)}{field("Special instruction",<input value={item.specialInstruction} onChange={(e)=>setCart({...cart,[key]:{...item,specialInstruction:e.target.value}})} placeholder="Optional"/>) }<div className="ws-store-add"><div className="ws-quantity"><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(0,item.quantity-1)}})}>−</button><b>{item.quantity}</b><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.min(99,item.quantity+1)}})}>＋</button></div><button className="ws-btn ws-btn-primary" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(1,item.quantity)}})}>Add</button></div></div></article>})}</div></section>)}{!categories.length&&empty("No public menu returned.")}</div>
            <aside className="ws-card ws-cart"><h3>Delivery cart</h3><p>{activeCartItems.reduce((n,[,item])=>n+item.quantity,0)} items · estimated subtotal</p>{activeCartItems.map(([id,item])=><div className="ws-cart-row" key={id}><div><b>{label(list(publicMenu.categories).flatMap((c)=>list(c.products)).find((p)=>String(p.id)===id)||{})}</b><small>Qty {item.quantity}</small></div></div>)}<div className="ws-cart-total"><span>Total estimate</span><strong>{asMoney(cartTotal,String(publicMenu.currency||"MMK"))}</strong></div>{field("Saved address",<select value={checkout.addressId} onChange={(e)=>setCheckout({...checkout,addressId:e.target.value})}><option value="">Choose address</option>{addresses.map((a)=><option key={String(a.id)} value={String(a.id)}>{label(a)} · {String(a.city||"")}</option>)}</select>)}{field("Delivery zone",<select value={checkout.zoneId} onChange={(e)=>setCheckout({...checkout,zoneId:e.target.value})}><option value="">Choose zone</option>{customerZones.map((z)=><option key={String(z.id)} value={String(z.id)}>{label(z)} · {asMoney(z.deliveryFee,String(publicMenu.currency||"MMK"))}</option>)}</select>)}{field("Recipient name",<input value={checkout.recipientName} onChange={(e)=>setCheckout({...checkout,recipientName:e.target.value})}/>)}{field("Recipient phone",<input value={checkout.recipientPhone} onChange={(e)=>setCheckout({...checkout,recipientPhone:e.target.value})}/>)}<button className="ws-btn ws-btn-primary ws-btn-block" disabled={!activeCartItems.length||busy} onClick={()=>void placeDeliveryOrder()}>Place cash-on-delivery order</button><button className="ws-link-btn" onClick={()=>changeView("addresses")}>Manage addresses ↗</button></aside></div>
        </>;
      }
  return null;
}

export function CustomerProfileView() {
  const {
    view,
    data,
    profileForm,
    setProfileForm,
    act,
    upload,
    saveProfile,
    intro,
    field,
    label,
  } = useWorkspaceContext();
      if (view === "profile") return <>
        {intro("My customer profile","Profile ownership is determined by the authenticated JWT subject. The avatar is stored privately and its signed URL expires.")}
        <section className="ws-card"><div className="ws-profile-header"><CustomerAvatar src={data.avatarUrl ? String(data.avatarUrl) : null} name={profileForm.fullName} /><div><h3>{String(data.fullName||"Customer")}</h3><p>{String(data.email||"")}</p><label className="ws-upload-btn">Upload avatar<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>{const f=e.target.files?.[0];if(f){const form=new FormData();form.append("file",f);void act(()=>call("/api/v1/customer/profile/avatar","POST",form),"Avatar updated.","profile");}}}/></label></div></div><form className="ws-form-grid" onSubmit={saveProfile}>{field("Full name",<input value={profileForm.fullName} onChange={(e)=>setProfileForm({...profileForm,fullName:e.target.value})} required/>)}{field("Phone",<input value={profileForm.phone} onChange={(e)=>setProfileForm({...profileForm,phone:e.target.value})}/>)}{field("Preferred language",<select value={profileForm.preferredLanguage} onChange={(e)=>setProfileForm({...profileForm,preferredLanguage:e.target.value})}><option value="en">English</option><option value="my-MM">မြန်မာ</option></select>)}<button className="ws-btn ws-btn-primary">Save profile</button></form></section>
      </>;
  return null;
}

export function CustomerAddressesView() {
  const {
    view,
    addresses,
    addressForm,
    setAddressForm,
    act,
    createAddress,
    intro,
    empty,
    field,
    editorButton,
    record,
    list,
    label,
  } = useWorkspaceContext();
      if (view === "addresses") return <>
        {intro("Saved delivery addresses","Use city and township consistently with delivery-zone coverage settings.")}
        <section className="ws-card"><h3>Add address</h3><form className="ws-form-grid" onSubmit={createAddress}>{[["label","Label"],["recipientName","Recipient"],["houseNo","House / building"],["street","Street"],["ward","Ward"],["township","Township"],["city","City"],["deliveryNote","Delivery note"]].map(([key,name])=>field(name,<input value={addressForm[key as keyof typeof addressForm] as string} onChange={(e)=>setAddressForm({...addressForm,[key]:e.target.value})} required={["label","recipientName","houseNo","street","township","city"].includes(key)}/>))}<label className="ws-check-row"><input type="checkbox" checked={addressForm.makeDefault} onChange={(e)=>setAddressForm({...addressForm,makeDefault:e.target.checked})}/> Make default</label><button className="ws-btn ws-btn-primary">Save address</button></form></section>
        <div className="ws-record-list">{addresses.map((a)=><article className="ws-record" key={String(a.id)}><div className="ws-record-main"><b>{label(a)} {a.isDefault?" · Default":""}</b><p>{[a.houseNo,a.street,a.ward,a.township,a.city].filter(Boolean).join(", ")}</p><small>{String(a.deliveryNote||"")}</small></div><div className="ws-record-actions">{editorButton("Edit address","/api/v1/customer/addresses/"+encodeURIComponent(String(a.id)),a)}{!a.isDefault&&<button className="ws-btn ws-btn-soft" onClick={()=>act(()=>call("/api/v1/customer/addresses/"+encodeURIComponent(String(a.id))+"/default","PATCH"),"Default address changed.")}>Make default</button>}<button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Delete this address?")&&void act(()=>call("/api/v1/customer/addresses/"+encodeURIComponent(String(a.id)),"DELETE"),"Address deleted.")}>Delete</button></div></article>)}</div>{!addresses.length&&empty("Save an address before placing a delivery order.")}
      </>;
  return null;
}

export function CustomerOrdersView() {
  const {
    view,
    orders,
    zones,
    addresses,
    customerOrders,
    checkout,
    setSelectedOrder,
    fail,
    act,
    loadView,
    changeView,
    reorderOrder,
    intro,
    empty,
    title,
    record,
    list,
    label,
    asMoney,
  } = useWorkspaceContext();
      if (view === "my-orders") return <>
        {intro("My orders","View your order history. You can cancel only pending orders and reorder eligible delivery orders using current addresses and zones.")}
        <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={()=>loadView("my-orders")}>Refresh history</button><button className="ws-btn ws-btn-primary" onClick={()=>changeView("storefront")}>Browse delivery menu</button></div><div className="ws-record-list">{customerOrders.map((o)=><article className="ws-record" key={String(o.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(o)}</b><span className="ws-status">{String(o.status||"")}</span></div><p>{String(o.orderType||"")} · {o.createdAt?new Date(o.createdAt).toLocaleString():""}</p><strong>{asMoney(o.totalAmount,String(o.currency||"MMK"))}</strong></div><div className="ws-record-actions"><button className="ws-btn ws-btn-muted" onClick={()=>void (async()=>{try{setSelectedOrder(record(await call("/api/v1/customer/orders/"+encodeURIComponent(String(o.id)))));}catch(cause){fail(cause);}})()}>Details</button>{o.status==="PENDING"&&<button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Cancel this pending order?")&&void act(()=>call("/api/v1/customer/orders/"+encodeURIComponent(String(o.id))+"/cancel","POST",{}),"Order cancelled.")}>Cancel</button>}{o.orderType==="DELIVERY"&&["COMPLETED","CANCELLED"].includes(String(o.status))&&<button className="ws-btn ws-btn-soft" onClick={()=>void reorderOrder(o)}>Reorder</button>}</div></article>)}</div>{!customerOrders.length&&empty("Your orders appear here after checkout.")}
      </>;
  return null;
}

export function NotificationsView() {
  const {
    view,
    notifications,
    act,
    loadView,
    intro,
    empty,
    title,
    record,
    list,
  } = useWorkspaceContext();
      if (view === "notifications") return <>
        {intro("Notifications","The backend stores in-app notifications. Browser push delivery and sound playback need a configured push provider on the client.")}
        <button className="ws-btn ws-btn-muted" onClick={()=>loadView("notifications")}>Refresh inbox</button><div className="ws-record-list">{notifications.map((n)=><article className="ws-record" key={String(n.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{String(n.title||n.notificationType||"Notification")}</b><span className="ws-status">{String(n.status||"")}</span></div><p>{String(n.body||"")}</p><small>{String(n.createdAt||"")}</small></div>{n.status!=="READ"&&<button className="ws-btn ws-btn-primary" onClick={()=>void act(()=>call("/api/v1/notifications/"+encodeURIComponent(String(n.id))+"/read","PATCH"),"Notification marked read.")}>Mark read</button>}</article>)}</div>{!notifications.length&&empty("No notifications found.")}
      </>;
  return null;
}

export function DevicesView() {
  const {
    token,
    view,
    busy,
    devices,
    deviceForm,
    setDeviceForm,
    act,
    loadView,
    registerDevice,
    intro,
    empty,
    field,
    record,
    list,
  } = useWorkspaceContext();
      if (view === "devices") return <>
        {intro("Push devices","Register a token generated by your configured Firebase / push SDK, then review or deactivate registered devices. The backend never returns raw push tokens in list responses.")}
        <section className="ws-card"><h3>Register a device token</h3><form className="ws-form-grid" onSubmit={registerDevice}>{field("Push token from your SDK",<input value={deviceForm.pushToken} onChange={(e)=>setDeviceForm({...deviceForm,pushToken:e.target.value})} required placeholder="Paste provider-generated token"/>,true)}{field("Platform",<select value={deviceForm.platform} onChange={(e)=>setDeviceForm({...deviceForm,platform:e.target.value})}><option value="WEB">Web</option><option value="ANDROID">Android</option><option value="IOS">iOS</option></select>)}<button className="ws-btn ws-btn-primary" disabled={busy}>Register device</button></form><p className="ws-muted">The workspace does not generate provider tokens on its own. Configure an SDK first, then register its token here.</p></section>
        <section className="ws-card"><div className="ws-card-heading"><h3>Registered devices</h3><button className="ws-btn ws-btn-muted" onClick={()=>loadView("devices")}>Refresh</button></div><div className="ws-record-list">{devices.map((d)=><article className="ws-record" key={String(d.id)}><div className="ws-record-main"><b>{String(d.platform||"Device")}</b><small>{String(d.deviceName||d.createdAt||"")}</small><span className="ws-status">{d.active===false?"Inactive":"Active"}</span></div>{d.active!==false&&<button className="ws-btn ws-btn-danger" onClick={()=>void act(()=>call("/api/v1/devices/"+encodeURIComponent(String(d.id)),"DELETE"),"Device deactivated.")}>Deactivate</button>}</article>)}</div>{!devices.length&&empty("No registered devices.")}</section>
      </>;
  return null;
}

export function QueueTrackerView() {
  const {
    token,
    view,
    busy,
    queue,
    checkout,
    ticket,
    setTicket,
    tracking,
    trackingNotifications,
    trackQueue,
    intro,
    field,
    title,
    record,
    list,
  } = useWorkspaceContext();
      if (view === "queue-track") return <>
        {intro("Customer queue tracker","Enter the ticket ID and tracking token provided at Common QR checkout. Requests use the X-Queue-Token header.")}
        <section className="ws-card"><form className="ws-form-grid" onSubmit={trackQueue}>{field("Queue ticket ID",<input value={ticket.id} onChange={(e)=>setTicket({...ticket,id:e.target.value})} required/>)}{field("Tracking token",<input value={ticket.token} onChange={(e)=>setTicket({...ticket,token:e.target.value})} required/>)}<button className="ws-btn ws-btn-primary" disabled={busy}>Track ticket</button></form></section>{Object.keys(tracking).length>0&&<section className="ws-card ws-tracking-status"><span className="ws-eyebrow">CURRENT QUEUE STATUS</span><strong>{String(tracking.displayCode||tracking.queueNumber||"—")}</strong><span className="ws-status">{String(tracking.queueStatus||"")}</span><p>Order {String(tracking.orderNumber||"")} · {String(tracking.orderStatus||"")}</p><div className="ws-record-list">{trackingNotifications.map((n)=><div className="ws-list-row" key={String(n.id)}><div><b>{String(n.title||"")}</b><small>{String(n.body||"")}</small></div></div>)}</div></section>}
      </>;
  return null;
}

