/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import type { Row, View } from "@/types/workspace";
import { useWorkspaceContext } from "@/features/workspace/WorkspaceContext";
import { AvailabilityBadge } from "@/components/menu/AvailabilityBadge";

export function MenuView() {
  const {
    view,
    data,
    categories,
    products,
    variantsByProduct,
    linkedGroupsByProduct,
    groupsList,
    linkForm,
    setLinkForm,
    search,
    setSearch,
    categoryName,
    setCategoryName,
    categoryOrder,
    setCategoryOrder,
    productForm,
    setProductForm,
    variantForm,
    setVariantForm,
    groupForm,
    setGroupForm,
    optionForm,
    setOptionForm,
    act,
    restaurantPath,
    loadView,
    editRecord,
    upload,
    createCategory,
    createProduct,
    createVariant,
    createGroup,
    intro,
    empty,
    field,
    editorButton,
    title,
    filteredProducts,
    record,
    list,
    label,
    asMoney,
  } = useWorkspaceContext();
      if (view === "menu") return <>
        {intro("Menu & catalogue","Create categories, products, variants and modifier choices. Upload product/variant images and link modifier groups to products. Backend roles control write access.")}
        <div className="ws-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" /><button className="ws-btn ws-btn-muted" onClick={() => loadView("menu")}>Refresh</button></div>
        <div className="ws-grid-two">
          <section className="ws-card"><h3>New category</h3><form className="ws-form-grid" onSubmit={createCategory}>{field("Name",<input value={categoryName} onChange={(e)=>setCategoryName(e.target.value)} required />)}{field("Display order",<input type="number" value={categoryOrder} onChange={(e)=>setCategoryOrder(e.target.value)} />)}<button className="ws-btn ws-btn-primary">Create category</button></form><div className="ws-chip-list">{categories.map((c)=><button className="ws-chip" key={String(c.id)} onClick={()=>editRecord("Edit category",restaurantPath("categories/"+encodeURIComponent(String(c.id))),c)}>{label(c)} · Edit</button>)}</div></section>
          <section className="ws-card"><h3>New product</h3><form className="ws-form-grid" onSubmit={createProduct}>{field("Product name",<input value={productForm.name} onChange={(e)=>setProductForm({...productForm,name:e.target.value})} required />)}{field("Category",<select value={productForm.categoryId} onChange={(e)=>setProductForm({...productForm,categoryId:e.target.value})} required><option value="">Select category</option>{categories.map((c)=><option key={String(c.id)} value={String(c.id)}>{label(c)}</option>)}</select>)}{field("Price",<input type="number" min="0" value={productForm.price} onChange={(e)=>setProductForm({...productForm,price:e.target.value})} required />)}{field("Description",<input value={productForm.description} onChange={(e)=>setProductForm({...productForm,description:e.target.value})} />,true)}{field("Availability",<select value={String(productForm.available)} onChange={(e)=>setProductForm({...productForm,available:e.target.value==="true"})}><option value="true">Available</option><option value="false">Unavailable</option></select>)}{field("Track stock",<select value={String(productForm.trackStock)} onChange={(e)=>setProductForm({...productForm,trackStock:e.target.value==="true"})}><option value="false">No</option><option value="true">Yes</option></select>)}{productForm.trackStock&&field("Stock quantity",<input type="number" min="0" value={productForm.stockQuantity} onChange={(e)=>setProductForm({...productForm,stockQuantity:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create product</button></form></section>
        </div>
        <section className="ws-card"><div className="ws-card-heading"><div><h3>Products</h3><p>{filteredProducts.length} results · choose a file to upload product or variant image</p></div></div><div className="ws-product-grid">{filteredProducts.map((p)=><article className="ws-product" key={String(p.id)}>{p.imageUrl?<img src={String(p.imageUrl)} alt={String(p.name)}/>:<div className="ws-product-placeholder">MENU</div>}<div className="ws-product-body"><div className="ws-record-title"><b>{label(p)}</b><AvailabilityBadge available={p.available !== false} /></div><p>{String(p.description||"")}</p><strong>{asMoney(p.price,String(data.currency||"MMK"))}</strong><div className="ws-inline-actions">{editorButton("Edit product",restaurantPath("products/"+encodeURIComponent(String(p.id))),p)}<label className="ws-upload-btn">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload(restaurantPath("products/"+encodeURIComponent(String(p.id))+"/image"),e.target.files?.[0])}/></label></div>{(variantsByProduct[String(p.id)]||[]).map((v)=><div className="ws-subitem" key={String(v.id)}><span>{label(v)} · {asMoney(v.price,String(data.currency||"MMK"))}</span>{editorButton("Edit variant",restaurantPath("products/"+encodeURIComponent(String(p.id))+"/variants/"+encodeURIComponent(String(v.id))),v)}<label className="ws-upload-btn">Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload(restaurantPath("products/"+encodeURIComponent(String(p.id))+"/variants/"+encodeURIComponent(String(v.id))+"/image"),e.target.files?.[0])}/></label></div>)}{(linkedGroupsByProduct[String(p.id)]||[]).map((g)=><div className="ws-subitem" key={"group-"+String(g.id)}><span>Modifier: {label(g)}</span><button className="ws-btn ws-btn-danger" onClick={()=>void act(()=>call(restaurantPath("products/"+encodeURIComponent(String(p.id))+"/modifier-groups/"+encodeURIComponent(String(g.id))),"DELETE"),"Modifier group detached.","menu")}>Detach</button></div>)}</div></article>)}</div>{!filteredProducts.length&&empty("No products yet.")}</section>
        <div className="ws-grid-two">
          <section className="ws-card"><h3>New variant</h3><form className="ws-form-grid" onSubmit={createVariant}>{field("Product",<select value={variantForm.productId} onChange={(e)=>setVariantForm({...variantForm,productId:e.target.value})} required><option value="">Select product</option>{products.map((p)=><option key={String(p.id)} value={String(p.id)}>{label(p)}</option>)}</select>)}{field("Variant name",<input value={variantForm.name} onChange={(e)=>setVariantForm({...variantForm,name:e.target.value})} required />)}{field("Price",<input type="number" min="0" value={variantForm.price} onChange={(e)=>setVariantForm({...variantForm,price:e.target.value})} required />)}<button className="ws-btn ws-btn-primary">Create variant</button></form></section>
          <section className="ws-card"><h3>Modifier groups & options</h3><form className="ws-form-grid" onSubmit={createGroup}>{field("New group",<input value={groupForm.name} onChange={(e)=>setGroupForm({...groupForm,name:e.target.value})} required />)}{field("Required",<select value={String(groupForm.required)} onChange={(e)=>setGroupForm({...groupForm,required:e.target.value==="true"})}><option value="false">Optional</option><option value="true">Required</option></select>)}{field("Min selections",<input type="number" min="0" value={groupForm.minSelections} onChange={(e)=>setGroupForm({...groupForm,minSelections:e.target.value})}/>)}{field("Max selections",<input type="number" min="1" value={groupForm.maxSelections} onChange={(e)=>setGroupForm({...groupForm,maxSelections:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create modifier group</button></form><form className="ws-form-grid ws-form-top" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("modifier-groups/"+encodeURIComponent(optionForm.groupId)+"/options"),"POST",{name:optionForm.name,additionalPrice:Number(optionForm.additionalPrice),available:true}),"Modifier option created.","menu");}}>{field("Group",<select value={optionForm.groupId} onChange={(e)=>setOptionForm({...optionForm,groupId:e.target.value})} required><option value="">Select group</option>{groupsList.map((g)=><option key={String(g.id)} value={String(g.id)}>{label(g)}</option>)}</select>)}{field("Option name",<input value={optionForm.name} onChange={(e)=>setOptionForm({...optionForm,name:e.target.value})} required />)}{field("Extra price",<input type="number" min="0" value={optionForm.additionalPrice} onChange={(e)=>setOptionForm({...optionForm,additionalPrice:e.target.value})}/>)}<button className="ws-btn ws-btn-muted">Add option</button></form><form className="ws-form-grid ws-form-top" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("products/"+encodeURIComponent(linkForm.productId)+"/modifier-groups/"+encodeURIComponent(linkForm.groupId)),"PUT"),"Modifier group attached to product.","menu");}}><h4 className="ws-field-wide">Attach modifier group to product</h4>{field("Product",<select value={linkForm.productId} onChange={(e)=>setLinkForm({...linkForm,productId:e.target.value})} required><option value="">Select product</option>{products.map((p)=><option key={String(p.id)} value={String(p.id)}>{label(p)}</option>)}</select>)}{field("Modifier group",<select value={linkForm.groupId} onChange={(e)=>setLinkForm({...linkForm,groupId:e.target.value})} required><option value="">Select group</option>{groupsList.map((g)=><option key={String(g.id)} value={String(g.id)}>{label(g)}</option>)}</select>)}<button className="ws-btn ws-btn-muted">Attach group</button></form><div className="ws-chip-list">{groupsList.map((g)=><button className="ws-chip" key={String(g.id)} onClick={()=>editRecord("Edit modifier group",restaurantPath("modifier-groups/"+encodeURIComponent(String(g.id))),g)}>{label(g)} · {list(g.options).length} options</button>)}</div><div className="ws-sublist">{groupsList.flatMap((g)=>list(g.options).map((option)=><div className="ws-subitem" key={String(option.id)}><span>{label(g)} / {label(option)} · +{asMoney(option.additionalPrice,String(data.currency||"MMK"))} · {option.available===false?"Unavailable":"Available"}</span><button className="ws-btn ws-btn-muted" onClick={()=>editRecord("Edit modifier option",restaurantPath("modifier-groups/"+encodeURIComponent(String(g.id))+"/options/"+encodeURIComponent(String(option.id))),option)}>Edit option</button></div>))}</div></section>
        </div>
      </>;
  return null;
}

export function TablesView() {
  const {
    token,
    view,
    tables,
    tableNumber,
    setTableNumber,
    restaurantPath,
    createTable,
    rotateSecret,
    intro,
    empty,
    field,
    editorButton,
    title,
    record,
    list,
    label,
  } = useWorkspaceContext();
      if (view === "tables") return <>
        {intro("Tables & QR codes","Create table identifiers, rename or deactivate tables, or rotate the token if a printed table QR code should stop working.")}
        <section className="ws-card"><form className="ws-inline-form" onSubmit={createTable}>{field("Table number",<input value={tableNumber} onChange={(e)=>setTableNumber(e.target.value)} placeholder="T1" required />)}<button className="ws-btn ws-btn-primary">＋ Add table</button></form></section>
        <div className="ws-record-list">{tables.map((t)=><article className="ws-record" key={String(t.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(t)}</b><span className="ws-status">{t.active===false?"Inactive":"Active"}</span></div><small>{String(t.id||"")}</small></div><div className="ws-record-actions">{editorButton("Edit table",restaurantPath("tables/"+encodeURIComponent(String(t.id))),t)}<button className="ws-btn ws-btn-primary" onClick={()=>void rotateSecret("tables/"+encodeURIComponent(String(t.id))+"/qr-token/rotate","Table QR token rotated; replace the printed QR.")}>Rotate QR</button></div></article>)}</div>{!tables.length&&empty("No tables set up yet.")}
      </>;
  return null;
}

export function SettingsView() {
  const {
    token,
    role,
    view,
    data,
    defaultDriver,
    members,
    driverInput,
    setDriverInput,
    checkout,
    act,
    restaurantPath,
    changeView,
    rotateSecret,
    intro,
    field,
    editorButton,
  } = useWorkspaceContext();
      if (view === "settings") return <>
        {intro("Restaurant settings","Read and update currency, timezone, checkout flags, minimum order, default delivery fee and the default driver setting. The Common QR token is only shown once when rotated.")}
        <div className="ws-grid-two"><section className="ws-card"><div className="ws-card-heading"><div><h3>Operational settings</h3><p>Current server response</p></div>{editorButton("Edit restaurant settings",restaurantPath("settings"),data)}</div><pre className="ws-json-preview">{JSON.stringify(data,null,2)}</pre><button className="ws-btn ws-btn-primary" onClick={()=>void rotateSecret("settings/common-qr-token/rotate","Common QR secret rotated. Replace previously printed codes.")}>Rotate Common QR secret</button></section><section className="ws-card"><h3>Default delivery driver</h3><p>Use the UUID of a DELIVERY_DRIVER in this restaurant. The API validates the role and restaurant membership.</p><form className="ws-form-grid" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("delivery-settings/default-driver"),"PATCH",{driverUserId:driverInput.trim()}),"Default delivery driver saved.","settings");}}>{field("Driver user UUID",<input value={driverInput} onChange={(e)=>setDriverInput(e.target.value)} placeholder="Paste driver UUID" required />)}<button className="ws-btn ws-btn-primary">Save default driver</button></form><p className="ws-muted">Current default: {defaultDriver||"Not configured"}</p><button className="ws-btn ws-btn-muted" onClick={()=>changeView("members")}>Open team members</button></section></div>
      </>;
  return null;
}

export function DeliveryZonesView() {
  const {
    view,
    data,
    zones,
    zoneForm,
    setZoneForm,
    act,
    restaurantPath,
    intro,
    empty,
    field,
    editorButton,
    title,
    record,
    list,
    label,
    asMoney,
  } = useWorkspaceContext();
      if (view === "zones") return <>
        {intro("Delivery zones","Set fee, minimum order and optional city/township restrictions. City and township should be set together for coverage checks.")}
        <section className="ws-card"><form className="ws-form-grid" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("delivery-zones"),"POST",{name:zoneForm.name,deliveryFee:Number(zoneForm.deliveryFee),minimumOrder:Number(zoneForm.minimumOrder),active:zoneForm.active,coverageCity:zoneForm.coverageCity||null,coverageTownship:zoneForm.coverageTownship||null}),"Delivery zone created.","zones");}}>{field("Name",<input value={zoneForm.name} onChange={(e)=>setZoneForm({...zoneForm,name:e.target.value})} required />)}{field("Delivery fee",<input type="number" min="0" value={zoneForm.deliveryFee} onChange={(e)=>setZoneForm({...zoneForm,deliveryFee:e.target.value})}/>)}{field("Minimum order",<input type="number" min="0" value={zoneForm.minimumOrder} onChange={(e)=>setZoneForm({...zoneForm,minimumOrder:e.target.value})}/>)}{field("Active",<select value={String(zoneForm.active)} onChange={(e)=>setZoneForm({...zoneForm,active:e.target.value==="true"})}><option value="true">Yes</option><option value="false">No</option></select>)}{field("Coverage city",<input value={zoneForm.coverageCity} onChange={(e)=>setZoneForm({...zoneForm,coverageCity:e.target.value})}/>)}{field("Coverage township",<input value={zoneForm.coverageTownship} onChange={(e)=>setZoneForm({...zoneForm,coverageTownship:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create zone</button></form></section>
        <div className="ws-record-list">{zones.map((z)=><article className="ws-record" key={String(z.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(z)}</b><span className="ws-status">{z.active===false?"Inactive":"Active"}</span></div><p>Fee {asMoney(z.deliveryFee,String(data.currency||"MMK"))} · Minimum {asMoney(z.minimumOrder,String(data.currency||"MMK"))}</p><small>{String(z.coverageCity||"Any city")} · {String(z.coverageTownship||"Any township")}</small></div>{editorButton("Edit delivery zone",restaurantPath("delivery-zones/"+encodeURIComponent(String(z.id))),z)}</article>)}</div>{!zones.length&&empty("No delivery zones configured.")}
      </>;
  return null;
}

export function TeamMembersView() {
  const {
    memberships,
    role,
    view,
    setError,
    members,
    inviteForm,
    setInviteForm,
    existingMemberForm,
    setExistingMemberForm,
    act,
    restaurantPath,
    loadView,
    addExistingMember,
    intro,
    empty,
    field,
    title,
    record,
    list,
    label,
  } = useWorkspaceContext();
      if (view === "members") return <>
        {intro("Team & roles","Only the OWNER role can manage memberships in the current backend policy. Invite new users, add existing profiles, change a non-owner role, remove a member or transfer ownership.")}
        <section className="ws-card"><h3>Invite a team member</h3><form className="ws-form-grid" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("members/invitations"),"POST",inviteForm),"Invitation requested.","members");}}>{field("Email",<input type="email" value={inviteForm.email} onChange={(e)=>setInviteForm({...inviteForm,email:e.target.value})} required/>)}{field("Full name",<input value={inviteForm.fullName} onChange={(e)=>setInviteForm({...inviteForm,fullName:e.target.value})} required/>)}{field("Role",<select value={inviteForm.role} onChange={(e)=>setInviteForm({...inviteForm,role:e.target.value})}><option value="MANAGER">Manager</option><option value="STAFF">Staff</option><option value="DELIVERY_DRIVER">Delivery driver</option></select>)}<button className="ws-btn ws-btn-primary">Send invitation</button></form></section>
        <section className="ws-card"><div className="ws-card-heading"><div><h3>Members</h3><p>UUIDs and roles returned by the API</p></div><button className="ws-btn ws-btn-muted" onClick={()=>loadView("members")}>Refresh</button></div><h4>Add an existing profile</h4><form className="ws-form-grid" onSubmit={addExistingMember}>{field("Existing user UUID",<input value={existingMemberForm.userId} onChange={(e)=>setExistingMemberForm({...existingMemberForm,userId:e.target.value})} required/>)}{field("Role",<select value={existingMemberForm.role} onChange={(e)=>setExistingMemberForm({...existingMemberForm,role:e.target.value})}><option value="MANAGER">Manager</option><option value="STAFF">Staff</option><option value="DELIVERY_DRIVER">Delivery driver</option></select>)}<button className="ws-btn ws-btn-primary">Add existing profile</button></form><div className="ws-record-list">{members.map((m)=><article className="ws-record" key={String(m.id||m.userId)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(m)}</b><span className="ws-status">{String(m.role||"")}</span></div><p>{String(m.email||"")}</p><small>{String(m.userId||m.id||"")}</small></div><div className="ws-record-actions">{m.role!=="OWNER"&&<><button className="ws-btn ws-btn-muted" onClick={()=>{const next=window.prompt("Enter the new role: MANAGER, STAFF, or DELIVERY_DRIVER",String(m.role||"STAFF"));if(next&&["MANAGER","STAFF","DELIVERY_DRIVER"].includes(next.toUpperCase()))void act(()=>call(restaurantPath("members/"+encodeURIComponent(String(m.id)),""),"PUT",{userId:m.userId,role:next.toUpperCase()}),"Member role updated.","members");else if(next)setError("Role must be MANAGER, STAFF, or DELIVERY_DRIVER.");}}>Change role</button><button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Remove this member from the restaurant?")&&void act(()=>call(restaurantPath("members/"+encodeURIComponent(String(m.id))),"DELETE"),"Member removed.")}>Remove</button><button className="ws-btn ws-btn-soft" onClick={()=>window.confirm("Transfer ownership to this member? Your role becomes MANAGER.")&&void act(()=>call(restaurantPath("members/transfer-ownership"),"POST",{newOwnerUserId:m.userId}),"Ownership transferred.")}>Transfer owner</button></>}</div></article>)}</div>{!members.length&&empty("No members loaded, or the account lacks permission.")}</section>
      </>;
  return null;
}

export function RestaurantProfileView() {
  const {
    restaurantId,
    view,
    data,
    changeView,
    upload,
    intro,
    editorButton,
    label,
  } = useWorkspaceContext();
      if (view === "restaurant") return <>
        {intro("Restaurant profile","Review restaurant data, update the profile and upload a restaurant logo. Logo update is OWNER-only; the backend validates type and size.")}
        <section className="ws-card"><pre className="ws-json-preview">{JSON.stringify(data,null,2)}</pre><div className="ws-inline-actions">{editorButton("Edit profile", "/api/v1/restaurants/"+encodeURIComponent(restaurantId)+"/profile",data)}<label className="ws-upload-btn">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload("/api/v1/restaurants/"+encodeURIComponent(restaurantId)+"/logo",e.target.files?.[0])}/></label><button className="ws-btn ws-btn-muted" onClick={()=>changeView("storefront")}>Preview customer storefront</button></div></section>
      </>;
  return null;
}

