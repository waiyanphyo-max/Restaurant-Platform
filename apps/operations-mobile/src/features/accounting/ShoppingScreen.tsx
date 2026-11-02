import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { AccountingSupplier, ConfirmPurchaseInput, ProcurementPaymentMethod, PurchaseDetail, PurchaseQuery, ShoppingItem, ShoppingLineInput, ShoppingSheet } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Choices, FormToggle, MutationFeedback } from "../../components/forms";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { isIsoDate } from "../operations/format";
import { procurementMoney as money, procurementPeriod, procurementToday, purchaseQuantity, purchaseTimestamp, purchaseWholeAmount } from "./procurement-format";

/** Retain an idempotency key across a network retry of the same form. Financial payloads stay in mounted memory. */
function useRequestKey() {
  const current=useRef<{signature:string;key:string}|null>(null);
  return (operation:string,body:unknown)=>{
    const signature=JSON.stringify([operation,body]);
    if(current.current?.signature!==signature)current.current={signature,key:`procurement:${Date.now()}:${Math.random().toString(36).slice(2)}`};
    return current.current.key;
  };
}
function fail(error:unknown) {return error instanceof Error?error.message:"Check the purchase fields.";}

async function sharePurchaseCsv(content:string) {
  if(Platform.OS==="web") {
    const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="purchase-history.csv";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);return;
  }
  const [fs,sharing]=await Promise.all([import("expo-file-system/legacy"),import("expo-sharing")]);
  if(!fs.cacheDirectory||!await sharing.isAvailableAsync())throw new Error("CSV sharing is unavailable on this device.");
  const path=`${fs.cacheDirectory}purchase-history-${Date.now()}.csv`;
  await fs.writeAsStringAsync(path,content,{encoding:fs.EncodingType.UTF8});
  try{await sharing.shareAsync(path,{mimeType:"text/csv",dialogTitle:"Export purchase history",UTI:"public.comma-separated-values-text"});}
  finally{await fs.deleteAsync(path,{idempotent:true}).catch(()=>undefined);}
}

export function ShoppingScreen() {
  const [tab,setTab]=useState<"SHOPPING"|"PURCHASE_HISTORY"|"SUPPLIERS">("SHOPPING");
  const settings=useApiQuery(signal=>getOperationsApi().getSettings({signal}),"shopping-settings");
  return <Page title="Shopping & purchases" subtitle="Plan shopping, confirm actual purchases and reconcile supplier balances">
    <Choices label="Workspace" value={tab} values={["SHOPPING","PURCHASE_HISTORY","SUPPLIERS"]} onChange={value=>setTab(value as typeof tab)}/>
    <QueryResult {...settings}>{value=><>
      <Body>{value.currency} · {value.timezone}. All purchase dates use the restaurant timezone.</Body>
      {tab==="SHOPPING"?<ShoppingPlanner today={procurementToday(value.timezone)}/>:tab==="PURCHASE_HISTORY"?<PurchaseHistory today={procurementToday(value.timezone)}/>:<Suppliers/>}
    </>}</QueryResult>
  </Page>;
}

function ShoppingPlanner({today}:{today:string}) {
  const mutation=useApiMutation(),key=useRequestKey();
  const [date,setDate]=useState(today),[search,setSearch]=useState(""),[searchTerm,setSearchTerm]=useState("");
  const [suggestions,setSuggestions]=useState(true),[page,setPage]=useState(0);
  const [lines,setLines]=useState<(ShoppingLineInput&{name:string})[]>([]);
  const [saved,setSaved]=useState<ShoppingSheet|null>(null),[reason,setReason]=useState("");
  const [posted,setPosted]=useState<PurchaseDetail|null>(null),[error,setError]=useState<string|null>(null);
  const [purchasedAt,setPurchasedAt]=useState(new Date().toISOString()),[supplier,setSupplier]=useState<AccountingSupplier|null>(null);
  const [invoice,setInvoice]=useState(""),[due,setDue]=useState("");
  const [pending,setPending]=useState<ConfirmPurchaseInput|null>(null);
  const [itemName,setItemName]=useState(""),[itemUnit,setItemUnit]=useState("kg"),[itemQuantity,setItemQuantity]=useState("1");
  const [showCatalogForm,setShowCatalogForm]=useState(false);
  const catalog=useApiQuery(signal=>getOperationsApi().listShoppingItems({search:searchTerm,suggestionsOnly:suggestions,page,size:20},{signal}),`shopping-items:${searchTerm}:${suggestions}:${page}`);
  const suppliers=useApiQuery(signal=>getOperationsApi().listAccountingSuppliers({size:200},{signal}),"shopping-suppliers");
  const sheets=useApiQuery(signal=>getOperationsApi().listShoppingSheets({from:isIsoDate(date)?date:today,to:isIsoDate(date)?date:today,size:50},{signal}),`shopping-sheets:${isIsoDate(date)?date:today}`);

  function add(item:ShoppingItem) {
    if(lines.some(line=>line.itemId===item.id))return;
    // A historic price belongs to its recorded unit; never silently apply it to another unit.
    setLines(value=>[...value,{itemId:item.id,name:item.name,quantity:item.defaultQuantity??"1",unit:item.latestCostUnit??item.defaultUnit,unitCost:item.latestUnitCost??"0",supplierId:item.supplierId}]);
  }
  function draftLines():ShoppingLineInput[] {
    if(!isIsoDate(date))throw new Error("Enter a valid shopping date.");
    if(!lines.length)throw new Error("Choose at least one shopping item.");
    return lines.map(line=>({itemId:line.itemId,quantity:purchaseQuantity(line.quantity),unit:line.unit.trim(),unitCost:purchaseWholeAmount(line.unitCost),supplierId:line.supplierId}));
  }
  function savePlan() {
    setError(null);
    try {
      const body={shoppingDate:date,lines:draftLines(),reason:saved?reason.trim():undefined};
      if(saved&&!reason.trim())throw new Error("Give a correction reason before updating a saved plan.");
      void mutation.run(()=>saved?getOperationsApi().updateShoppingSheet(saved.id,body,key(`plan:${saved.id}`,body)):getOperationsApi().createShoppingSheet(body,key("plan",body)),value=>{setSaved(value);sheets.reload();});
    }catch(error){setError(fail(error));}
  }
  function prepareConfirmation() {
    setError(null);
    try {
      if(due&&!isIsoDate(due))throw new Error("Enter a valid due date or leave it blank.");
      const actual=draftLines().map(line=>({...line,supplierId:supplier?.id??null}));
      setPending({purchaseDate:date,purchasedAt:purchaseTimestamp(purchasedAt),lines:actual,supplierId:supplier?.id??null,sheetId:saved?.id,invoiceReference:invoice.trim()||null,dueDate:due||null});
    }catch(error){setError(fail(error));}
  }
  function confirm() {
    const body=pending;setPending(null);if(!body)return;
    void mutation.run(()=>getOperationsApi().confirmPurchase(body,key("confirm",body)),value=>{
      setPosted(value);setLines([]);setSaved(null);setReason("");catalog.reload();sheets.reload();
    });
  }
  function loadSheet(sheet:ShoppingSheet) {
    setSaved(sheet);setDate(sheet.shoppingDate);setReason("");
    setLines(sheet.lines.map(line=>({itemId:line.itemId,name:line.itemName,quantity:line.quantity,unit:line.unit,unitCost:line.unitCost,supplierId:line.supplierId})));
  }
  const locked=saved?.status!==undefined&&saved.status!=="PLANNED";
  return <>
    <Card title="Shopping catalog">
      <Body>Suggestions include confirmed purchases from the last seven restaurant calendar days. Expired items remain available under “All catalog items”.</Body>
      <FormToggle label="Automatic suggestions only" value={suggestions} onChange={value=>{setSuggestions(value);setPage(0);}}/>
      <FormField label="Find an item" value={search} onChangeText={setSearch}/><Action title="Search catalog" secondary onPress={()=>{setSearchTerm(search);setPage(0);catalog.reload();}}/>
      <QueryResult {...catalog}>{value=><>
        {!value.content.length?<Body>No matching items. Search all catalog items or add a reusable item.</Body>:null}
        {value.content.map(item=><Card key={item.id} title={item.name}>
          <Body>Last confirmed purchase: {item.lastConfirmedPurchaseDate??"None"}. Latest cost: {item.latestUnitCost===null?"Unknown":`${money(item.latestUnitCost)} / ${item.latestCostUnit}`}.</Body>
          <Action title={lines.some(line=>line.itemId===item.id)?"Added":"Add to sheet"} disabled={mutation.busy||locked||lines.some(line=>line.itemId===item.id)} onPress={()=>add(item)}/>
        </Card>)}
        <Body>Page {page+1} · {value.totalElements} catalog items</Body>
        <Action title="Previous items" secondary disabled={page===0} onPress={()=>setPage(value=>value-1)}/>
        <Action title="Next items" secondary disabled={(page+1)*value.size>=value.totalElements} onPress={()=>setPage(value=>value+1)}/>
      </>}</QueryResult>
      <Action title={showCatalogForm?"Hide new item":"Add reusable catalog item"} secondary onPress={()=>setShowCatalogForm(value=>!value)}/>
      {showCatalogForm?<>
        <FormField label="Item name" value={itemName} onChangeText={setItemName}/><FormField label="Default unit" value={itemUnit} onChangeText={setItemUnit}/>
        <FormField label="Default quantity (optional)" value={itemQuantity} onChangeText={setItemQuantity} keyboardType="decimal-pad"/>
        <Action title="Save catalog item" disabled={mutation.busy} onPress={()=>{
          setError(null);try {
            if(!itemName.trim()||!itemUnit.trim())throw new Error("Enter the item name and unit.");
            const body={name:itemName.trim(),defaultUnit:itemUnit.trim(),defaultQuantity:itemQuantity?purchaseQuantity(itemQuantity):null,suggestionEnabled:true};
            void mutation.run(()=>getOperationsApi().createShoppingItem(body,key("catalog",body)),()=>{setItemName("");setShowCatalogForm(false);setSuggestions(false);setPage(0);catalog.reload();});
          }catch(error){setError(fail(error));}
        }}/>
      </>:null}
    </Card>
    <Card title={saved?`Sheet · ${saved.status}`:"Daily shopping sheet"}>
      <FormField label="Shopping date (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!locked}/>
      <Body>A saved plan has no purchase or payment effect. Confirm only goods actually purchased. Record its payment separately.</Body>
      {lines.map((line,index)=><Card key={line.itemId} title={line.name}>
        <FormField label={`Quantity · ${line.name}`} value={line.quantity} keyboardType="decimal-pad" editable={!locked} onChangeText={value=>setLines(lines=>lines.map((line,i)=>i===index?{...line,quantity:value}:line))}/>
        <FormField label={`Unit · ${line.name}`} value={line.unit} editable={!locked} onChangeText={value=>setLines(lines=>lines.map((line,i)=>i===index?{...line,unit:value}:line))}/>
        <FormField label={`Unit cost · ${line.name}`} value={line.unitCost} keyboardType="number-pad" editable={!locked} onChangeText={value=>setLines(lines=>lines.map((line,i)=>i===index?{...line,unitCost:value}:line))}/>
        {!locked?<Action title={`Remove ${line.name}`} secondary onPress={()=>setLines(lines=>lines.filter((_,i)=>i!==index))}/>:null}
      </Card>)}
      {saved?<Body>Saved line total: {saved.lines.map(line=>`${line.itemName}: ${money(line.lineTotal)}`).join("; ")}</Body>:null}
      {saved&&!locked?<FormField label="Plan correction reason" value={reason} onChangeText={setReason}/>:null}
      {!locked?<Action title={saved?"Save corrected plan":"Save unpurchased plan"} disabled={mutation.busy||!lines.length} onPress={savePlan}/>:null}
      <Action title="Start another sheet" secondary disabled={mutation.busy} onPress={()=>{setSaved(null);setLines([]);setReason("");setPosted(null);}}/>
      {!locked?<>
        <FormField label="Actual purchase timestamp (with timezone)" value={purchasedAt} onChangeText={setPurchasedAt} autoCapitalize="none"/>
        <FormField label="Invoice / receipt reference (optional)" value={invoice} onChangeText={setInvoice}/>
        <FormField label="Due date (optional, YYYY-MM-DD)" value={due} onChangeText={setDue}/>
        <SupplierPicker value={supplier} query={suppliers} onChange={setSupplier}/>
        <Body>Confirm one supplier per purchase. This creates a confirmed purchase obligation and preserves the recorded costs.</Body>
        <Action title="Confirm actual purchase…" disabled={mutation.busy||!lines.length} onPress={prepareConfirmation}/>
      </>:null}
      {error?<Body>{error}</Body>:null}<MutationFeedback {...mutation}/>
    </Card>
    <Card title="Saved sheets for this date"><QueryResult {...sheets}>{value=><>
      {!value.content.length?<Body>No saved shopping sheets.</Body>:null}
      {value.content.map(sheet=><Action key={sheet.id} title={`${sheet.shoppingDate} · ${sheet.status} · ${sheet.lines.length} items · ${sheet.paymentStatus}`} secondary disabled={mutation.busy} onPress={()=>loadSheet(sheet)}/>)}
    </>}</QueryResult></Card>
    {posted?<Card title="Confirmed purchase"><Body>{posted.purchase.purchaseDate} · {money(posted.purchase.totalAmount)} · {posted.purchase.paymentStatus}</Body><PurchaseDetailContent detail={posted} onChanged={value=>setPosted(value)}/></Card>:null}
    <ConfirmDialog visible={pending!==null} title="Confirm actual purchase" message={`Confirm ${pending?.lines.length??0} purchased items on ${pending?.purchaseDate??""}. This records an actual obligation. A shopping plan alone does not post an expense.`} confirmLabel="Confirm purchased goods" onConfirm={confirm} onCancel={()=>setPending(null)}/>
  </>;
}

function SupplierPicker({value,query,onChange}:{value:AccountingSupplier|null;query:ReturnType<typeof useApiQuery<{content:AccountingSupplier[]}>>;onChange(value:AccountingSupplier|null):void}) {
  return <Card title={`Supplier: ${value?.name??"Unspecified"}`}>
    <Action title="No supplier" secondary onPress={()=>onChange(null)}/>
    <QueryResult {...query}>{result=><>{result.content.map(supplier=><Action key={supplier.id} title={`${value?.id===supplier.id?"✓ ":""}${supplier.name}${supplier.active?"":" (inactive)"}`} secondary onPress={()=>onChange(supplier)}/>)}</>}</QueryResult>
  </Card>;
}

function PurchaseHistory({today}:{today:string}) {
  const [mode,setMode]=useState<"DAY"|"MONTH"|"RANGE">("DAY"),[date,setDate]=useState(today),[month,setMonth]=useState(today.slice(0,7));
  const [from,setFrom]=useState(today),[to,setTo]=useState(today),[item,setItem]=useState("");
  const [supplier,setSupplier]=useState<AccountingSupplier|null>(null),[status,setStatus]=useState("ALL");
  const [filter,setFilter]=useState<PurchaseQuery>({from:today,to:today}),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const mutation=useApiMutation();
  const suppliers=useApiQuery(signal=>getOperationsApi().listAccountingSuppliers({size:200},{signal}),"history-suppliers");
  const query=useApiQuery(signal=>getOperationsApi().listPurchases({...filter,page,size:20},{signal}),`purchases:${JSON.stringify(filter)}:${page}`);
  const report=useApiQuery(signal=>getOperationsApi().getPurchaseReport(filter,{signal}),`purchase-report:${JSON.stringify(filter)}`);
  function apply() {
    setError(null);try {
      setFilter({...procurementPeriod(mode,date,month,from,to),item:item.trim()||undefined,supplierId:supplier?.id,paymentStatus:status==="ALL"?undefined:status as PurchaseQuery["paymentStatus"]});setPage(0);setSelected(null);query.reload();report.reload();
    }catch(error){setError(fail(error));}
  }
  return <>
    <Card title="Purchase history filters">
      <Choices label="Period" value={mode} values={["DAY","MONTH","RANGE"]} onChange={value=>setMode(value as typeof mode)}/>
      {mode==="DAY"?<FormField label="Purchase date (YYYY-MM-DD)" value={date} onChangeText={setDate}/>:mode==="MONTH"?<FormField label="Purchase month (YYYY-MM)" value={month} onChangeText={setMonth}/>:<><FormField label="From date" value={from} onChangeText={setFrom}/><FormField label="Through date" value={to} onChangeText={setTo}/></>}
      <FormField label="Search historical item names" value={item} onChangeText={setItem}/>
      <Choices label="Payment status" value={status} values={["ALL","UNPAID","PARTIALLY_PAID","PAID"]} onChange={setStatus}/>
      <SupplierPicker value={supplier} query={suppliers} onChange={setSupplier}/>
      <Action title="Load purchase history" onPress={apply}/>{error?<Body>{error}</Body>:null}
      <Action title="Export purchase CSV" secondary disabled={mutation.busy} onPress={()=>void mutation.run(async()=>{
        await sharePurchaseCsv(await getOperationsApi().getPurchaseCsv(filter));
      })}/><MutationFeedback {...mutation}/>
    </Card>
    <QueryResult {...report}>{value=><Card title={`${value.from} through ${value.to}`}>
      <Body>Confirmed purchases: {money(value.confirmedTotal)} · {value.purchaseCount} purchases</Body>
      <Body>Cancelled historical purchases: {money(value.cancelledTotal)}</Body>
      {value.monthlyTotals.map(month=><Body key={month.month}>{month.month.slice(0,7)}: {money(month.confirmedTotal)}</Body>)}
      <Body>These purchase totals measure recorded obligations. They do not establish stock consumption or profit.</Body>
    </Card>}</QueryResult>
    <QueryResult {...query}>{value=><Card title="Historical purchases">
      {!value.content.length?<Body>No matching purchases.</Body>:null}
      {value.content.map(purchase=><Card key={purchase.id} title={`${purchase.purchaseDate} · ${purchase.supplierName??"Supplier unspecified"}`}>
        <Body>{money(purchase.totalAmount)} · {purchase.status} · {purchase.paymentStatus}</Body><Body>Purchased at {purchase.purchasedAt}</Body>
        <Body>Paid {money(purchase.amountPaid)} · Outstanding {money(purchase.outstandingAmount)}</Body>
        <Action title="Inspect purchase, payments & corrections" secondary onPress={()=>setSelected(purchase.id)}/>
      </Card>)}
      <Body>Page {page+1} · {value.totalElements} purchases</Body>
      <Action title="Previous purchases" secondary disabled={page===0} onPress={()=>setPage(value=>value-1)}/>
      <Action title="Next purchases" secondary disabled={(page+1)*value.size>=value.totalElements} onPress={()=>setPage(value=>value+1)}/>
    </Card>}</QueryResult>
    {selected?<PurchaseDetailView id={selected} onChanged={()=>{query.reload();report.reload();}}/>:null}
  </>;
}

function PurchaseDetailView({id,onChanged}:{id:string;onChanged():void}) {
  const query=useApiQuery(signal=>getOperationsApi().getPurchase(id,{signal}),`purchase-detail:${id}`);
  return <QueryResult {...query}>{detail=><Card title={`Purchase · ${detail.purchase.id}`}><PurchaseDetailContent detail={detail} onChanged={()=>{query.reload();onChanged();}}/></Card>}</QueryResult>;
}

function PurchaseDetailContent({detail,onChanged}:{detail:PurchaseDetail;onChanged(value:PurchaseDetail):void}) {
  const {purchase}=detail;
  const [amount,setAmount]=useState(purchase.outstandingAmount),[method,setMethod]=useState<ProcurementPaymentMethod>("CASH");
  const [paidAt,setPaidAt]=useState(new Date().toISOString()),[reason,setReason]=useState("");
  const [pending,setPending]=useState<{title:string;action:()=>Promise<PurchaseDetail>}|null>(null),[error,setError]=useState<string|null>(null);
  const mutation=useApiMutation(),key=useRequestKey();
  useEffect(()=>setAmount(purchase.outstandingAmount),[purchase.outstandingAmount]);
  function payment() {
    setError(null);try {
      const body={amount:purchaseWholeAmount(amount,true),method,paidAt:purchaseTimestamp(paidAt)};
      setPending({title:`Record ${money(body.amount)} by ${method}`,action:()=>getOperationsApi().recordPurchasePayment(purchase.id,body,key(`pay:${purchase.id}`,body))});
    }catch(error){setError(fail(error));}
  }
  function correction(kind:"CANCEL"|"REVERSE",paymentId?:string) {
    setError(null);if(!reason.trim()){setError("Enter a correction reason.");return;}
    const explanation=reason.trim();
    setPending({title:kind==="CANCEL"?"Cancel confirmed purchase":"Reverse purchase payment",action:()=>kind==="CANCEL"?getOperationsApi().cancelPurchase(purchase.id,explanation,key(`cancel:${purchase.id}`,explanation)):getOperationsApi().reversePurchasePayment(purchase.id,paymentId!,explanation,key(`reverse:${paymentId}`,explanation))});
  }
  return <>
    <Body>Purchased: {purchase.purchasedAt} · Recorded: {purchase.createdAt}</Body>
    <Body>Recorded by: {purchase.createdBy} · Supplier: {purchase.supplierName??"Unspecified"}</Body>
    <Body>Total {money(purchase.totalAmount)} · Paid {money(purchase.amountPaid)} · Outstanding {money(purchase.outstandingAmount)} · {purchase.paymentStatus} · {purchase.status}</Body>
    <Body>Invoice: {purchase.invoiceReference??"None"} · Due: {purchase.dueDate??"Unspecified"}</Body>
    {purchase.receiptId?<Body>Private receipt attached.</Body>:null}
    <DataTable columns={["Historical item","Quantity / unit","Historical cost","Line total"]} rows={detail.lines.map(line=>({key:line.id,cells:[line.itemName,`${line.quantity} ${line.unit}`,money(line.unitCost),money(line.lineTotal)]}))}/>
    <Card title="Chronological payment history">
      {!detail.payments.length?<Body>No recorded payments.</Body>:null}
      {detail.payments.map(payment=><Card key={payment.id}>
        <Body>{payment.paidAt} · {payment.method} · {money(payment.amount)}</Body><Body>Recorded by {payment.createdBy} at {payment.createdAt}</Body>
        {payment.reversalId?<Body>Reversed at {payment.reversedAt} by {payment.reversedBy}: {payment.reversalReason}</Body>:<Action title="Reverse this payment…" secondary disabled={mutation.busy} onPress={()=>correction("REVERSE",payment.id)}/>}
      </Card>)}
    </Card>
    {purchase.status==="CONFIRMED"&&purchase.outstandingAmount!=="0"?<Card title="Record a real payment">
      <FormField label="Payment amount (whole currency)" value={amount} onChangeText={setAmount} keyboardType="number-pad"/>
      <Choices label="Payment method" value={method} values={["CASH","BANK_TRANSFER","CARD","OTHER"]} onChange={value=>setMethod(value as ProcurementPaymentMethod)}/>
      <FormField label="Actual payment timestamp (with timezone)" value={paidAt} onChangeText={setPaidAt}/>
      <Action title="Record payment…" disabled={mutation.busy} onPress={payment}/>
    </Card>:null}
    <Card title="Corrections & cancellations">
      {purchase.correctionOfId?<Body>Replacement for purchase {purchase.correctionOfId}</Body>:null}
      {detail.cancellations.map(adjustment=><Body key={adjustment.id}>Cancelled {adjustment.createdAt} by {adjustment.createdBy}: {adjustment.reason}</Body>)}
      {detail.corrections.map(id=><Body key={id}>Replacement purchase: {id}</Body>)}
      <FormField label="Correction / cancellation reason" value={reason} onChangeText={setReason}/>
      {purchase.status==="CONFIRMED"?<>
        <Body>Reverse effective payments before cancelling a purchase. Reversals remain in history.</Body>
        <Action title="Cancel purchase…" secondary disabled={mutation.busy||purchase.amountPaid!=="0"} onPress={()=>correction("CANCEL")}/>
      </>:null}
    </Card>
    {error?<Body>{error}</Body>:null}<MutationFeedback {...mutation}/>
    <ConfirmDialog visible={pending!==null} title={pending?.title??"Confirm financial change"} message="Confirm that this reflects an actual payment or an authorized correction. The original financial history remains visible." confirmLabel="Confirm" onConfirm={()=>{
      const action=pending;setPending(null);if(action)void mutation.run(action.action,onChanged);
    }} onCancel={()=>setPending(null)}/>
  </>;
}

function Suppliers() {
  const [search,setSearch]=useState(""),[term,setTerm]=useState(""),[page,setPage]=useState(0);
  const [editing,setEditing]=useState<AccountingSupplier|null>(null),[name,setName]=useState(""),[contact,setContact]=useState("");
  const [active,setActive]=useState(true),[reason,setReason]=useState(""),[error,setError]=useState<string|null>(null);
  const [statement,setStatement]=useState<string|null>(null);
  const mutation=useApiMutation(),key=useRequestKey();
  const query=useApiQuery(signal=>getOperationsApi().listAccountingSuppliers({search:term,page,size:20},{signal}),`suppliers:${term}:${page}`);
  const payables=useApiQuery(signal=>getOperationsApi().getSupplierPayables({page,size:20},{signal}),`supplier-payables:${page}`);
  function save() {
    setError(null);try {
      if(!name.trim())throw new Error("Enter a supplier name.");
      if(editing&&!reason.trim())throw new Error("Give a reason for the supplier correction.");
      const body={name:name.trim(),contact:contact.trim()||null,active,reason:editing?reason.trim():undefined};
      void mutation.run(()=>editing?getOperationsApi().updateAccountingSupplier(editing.id,body,key(`supplier:${editing.id}`,body)):getOperationsApi().createAccountingSupplier(body,key("supplier",body)),()=>{
        setEditing(null);setName("");setContact("");setReason("");setActive(true);query.reload();payables.reload();
      });
    }catch(error){setError(fail(error));}
  }
  return <>
    <Card title={editing?"Correct supplier":"New supplier"}>
      <FormField label="Supplier name" value={name} onChangeText={setName}/><FormField label="Supplier contact details" value={contact} onChangeText={setContact} multiline/>
      <FormToggle label="Active supplier" value={active} onChange={setActive}/>
      {editing?<FormField label="Supplier correction reason" value={reason} onChangeText={setReason}/>:null}
      <Action title="Save supplier" disabled={mutation.busy} onPress={save}/>
      {editing?<Action title="Cancel editing" secondary onPress={()=>{setEditing(null);setName("");setContact("");setReason("");setActive(true);}}/>:null}
      {error?<Body>{error}</Body>:null}<MutationFeedback {...mutation}/>
    </Card>
    <Card title="Supplier register">
      <FormField label="Find a supplier" value={search} onChangeText={setSearch}/><Action title="Search suppliers" secondary onPress={()=>{setTerm(search);setPage(0);query.reload();}}/>
      <QueryResult {...query}>{value=><>
        {!value.content.length?<Body>No matching suppliers.</Body>:null}
        {value.content.map(supplier=><Card key={supplier.id} title={supplier.name}>
          <Body>{supplier.contact??"No contact details"} · {supplier.active?"Active":"Inactive"}</Body>
          <Action title="Edit supplier" secondary onPress={()=>{setEditing(supplier);setName(supplier.name);setContact(supplier.contact??"");setActive(supplier.active);setReason("");}}/>
          <Action title="Supplier payment history" secondary onPress={()=>setStatement(supplier.id)}/>
        </Card>)}
        <Body>Page {page+1} · {value.totalElements} suppliers</Body>
        <Action title="Previous suppliers" secondary disabled={page===0} onPress={()=>setPage(value=>value-1)}/><Action title="Next suppliers" secondary disabled={(page+1)*value.size>=value.totalElements} onPress={()=>setPage(value=>value+1)}/>
      </>}</QueryResult>
    </Card>
    <QueryResult {...payables}>{value=><Card title="Confirmed supplier payables">
      <DataTable columns={["Supplier","Obligations","Paid","Outstanding","Earliest unpaid due"]} rows={value.content.map(row=>({key:row.supplierId,cells:[row.supplierName,money(row.confirmedObligations),money(row.amountPaid),money(row.outstandingAmount),row.earliestUnpaidDueDate??"Unspecified"]}))}/>
    </Card>}</QueryResult>
    {statement?<SupplierHistory supplier={statement}/>:null}
  </>;
}
function SupplierHistory({supplier}:{supplier:string}) {
  const [page,setPage]=useState(0);
  const query=useApiQuery(signal=>getOperationsApi().listSupplierPayments(supplier,{page,size:20},{signal}),`supplier-payments:${supplier}:${page}`);
  return <QueryResult {...query}>{value=><Card title="Supplier payment history">
    {!value.content.length?<Body>No recorded supplier payments.</Body>:null}
    {value.content.map(row=><Body key={row.payment.id}>{row.payment.paidAt} · {money(row.payment.amount)} · {row.payment.method} · Invoice {row.invoiceReference??row.purchaseId}{row.payment.reversalId?` · Reversed ${row.payment.reversedAt}: ${row.payment.reversalReason}`:""}</Body>)}
    <Action title="Previous payments" secondary disabled={page===0} onPress={()=>setPage(value=>value-1)}/><Action title="Next payments" secondary disabled={(page+1)*value.size>=value.totalElements} onPress={()=>setPage(value=>value+1)}/>
  </Card>}</QueryResult>;
}
