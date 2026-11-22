$ErrorActionPreference = 'Stop'
$workspace = 'C:\RestaurantManagementSystem\Restaurant-Platform'
$qa = Join-Path $workspace 'docs\qa\uxi-13'
$apiBase = 'http://127.0.0.1:58013'
$restaurantA = '00000000-0000-4000-8000-00000000a013'
$restaurantB = '00000000-0000-4000-8000-00000000b013'
$sql = @'
INSERT INTO public.restaurants(id,name,slug,township,city) VALUES
('00000000-0000-4000-8000-00000000a013','UXI-13 Synthetic Red A','uxi-13-synthetic-red-a','Synthetic Township A','Synthetic City A'),
('00000000-0000-4000-8000-00000000b013','UXI-13 Synthetic Blue B','uxi-13-synthetic-blue-b','Synthetic Township B','Synthetic City B');
INSERT INTO public.restaurant_settings(restaurant_id,currency,timezone) VALUES
('00000000-0000-4000-8000-00000000a013','MMK','Asia/Yangon'),('00000000-0000-4000-8000-00000000b013','THB','Asia/Bangkok');
INSERT INTO public.restaurant_runtime_branding(restaurant_id,primary_color,secondary_color,background_color,revision) VALUES
('00000000-0000-4000-8000-00000000a013','#A51D22','#FCEAE7','#FFF8F0',1),
('00000000-0000-4000-8000-00000000b013','#123B70','#DDEEFF','#F4FAFF',1);
INSERT INTO public.categories(id,restaurant_id,name) VALUES
('00000000-0000-4000-8000-00000000a113','00000000-0000-4000-8000-00000000a013','Synthetic A Meals'),
('00000000-0000-4000-8000-00000000b113','00000000-0000-4000-8000-00000000b013','Synthetic B Bowls');
INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES
('00000000-0000-4000-8000-00000000a213','00000000-0000-4000-8000-00000000a013','00000000-0000-4000-8000-00000000a113','Synthetic Red Rice',4500),
('00000000-0000-4000-8000-00000000b213','00000000-0000-4000-8000-00000000b013','00000000-0000-4000-8000-00000000b113','Synthetic Blue Bowl',125);
SELECT 9007199254740993::bigint::text AS exact_bigint,
       (9007199254740993::numeric + 17)::text AS exact_sum,
       (9007199254740993::numeric * 2)::text AS exact_product;
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user;
'@
$fixturePath=Join-Path $workspace '.tmp\uxi-13-pg16\http-fixture.sql'
[IO.File]::WriteAllText($fixturePath,$sql)
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -X -h 127.0.0.1 -p 55413 -U postgres -d accounting_verify -v ON_ERROR_STOP=1 -f $fixturePath *> (Join-Path $qa 'postgres-http-fixture.log')
if ($LASTEXITCODE -ne 0) { throw 'Synthetic HTTP fixture failed' }
$jar=Join-Path $workspace 'app\api\target\restaurant-platform-persistence-0.0.1-SNAPSHOT.jar'
$arguments=@('-jar', $jar, '--server.port=58013', '--spring.datasource.url=jdbc:postgresql://127.0.0.1:55413/accounting_verify',
    '--spring.datasource.username=postgres','--spring.datasource.password=',
    '--spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1',
    '--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json',
    '--app.supabase-admin.project-url=','--app.supabase-admin.service-role-key=',
    '--app.push.firebase.enabled=false','--app.security.platform-admin-user-ids=',
    '--spring.datasource.hikari.maximum-pool-size=3')
$server=Start-Process -WindowStyle Hidden -PassThru -FilePath 'C:\Program Files\java\jdk-21\bin\java.exe' -ArgumentList $arguments -WorkingDirectory $workspace -RedirectStandardOutput (Join-Path $qa 'spring-http-stdout.log') -RedirectStandardError (Join-Path $qa 'spring-http-stderr.log')
try {
    $health=$null
    for($attempt=0;$attempt -lt 60;$attempt++) {
        try { $health=Invoke-RestMethod ($apiBase+'/actuator/health') -TimeoutSec 2; if($health.status -eq 'UP'){break} } catch { }
        if($server.HasExited){throw 'Synthetic Spring smoke server exited before readiness'}
        Start-Sleep -Seconds 1
    }
    if($health.status -ne 'UP'){throw 'Synthetic Spring smoke server never became ready'}
    $brandA=Invoke-RestMethod ($apiBase+'/api/v1/public/restaurants/'+$restaurantA+'/branding') -TimeoutSec 10
    $brandB=Invoke-RestMethod ($apiBase+'/api/v1/public/restaurants/'+$restaurantB+'/branding') -TimeoutSec 10
    $menuA=Invoke-RestMethod ($apiBase+'/api/v1/public/restaurants/'+$restaurantA+'/menu') -TimeoutSec 10
    $menuB=Invoke-RestMethod ($apiBase+'/api/v1/public/restaurants/'+$restaurantB+'/menu') -TimeoutSec 10
    $checks=@{
        healthUp=$health.status -eq 'UP'
        brandAIdentity=$brandA.restaurantId -eq $restaurantA
        brandBIdentity=$brandB.restaurantId -eq $restaurantB
        brandAPalette=$brandA.palette.primaryColor -eq '#A51D22'
        brandBPalette=$brandB.palette.primaryColor -eq '#123B70'
        menuACurrency=$menuA.currency -eq 'MMK'
        menuBCurrency=$menuB.currency -eq 'THB'
        menuAProduct=($menuA.categories.products.name -join ',') -eq 'Synthetic Red Rice'
        menuBProduct=($menuB.categories.products.name -join ',') -eq 'Synthetic Blue Bowl'
        noPrivateBrandFields=($brandA.PSObject.Properties.Name -join ',') -notmatch 'owner|qr|member|financial|secret|configuration'
    }
    $protected=Invoke-WebRequest ($apiBase+'/api/v1/restaurants/'+$restaurantA+'/accounting/reports/summary') -TimeoutSec 10 -SkipHttpErrorCheck
    $checks['anonymousFinanceDenied']=$protected.StatusCode -eq 401
    $checks['unauthorizedNoStore']=[bool]($protected.Headers['Cache-Control'] -match 'no-store')
    $brandingResponse=Invoke-WebRequest ($apiBase+'/api/v1/public/restaurants/'+$restaurantA+'/branding') -TimeoutSec 10
    $checks['brandingNoStore']=[bool]($brandingResponse.Headers['Cache-Control'] -match 'no-store')
    $result=[ordered]@{date='2026-11-22 Asia/Bangkok';renderer='Actual Spring Boot 4.1.1 executable JAR HTTP + PostgreSQL 16.4';databasePrincipal='postgres, superuser; not hosted principal proof';checks=$checks;brandA=$brandA;brandB=$brandB;menuA=$menuA;menuB=$menuB}
    $result | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $qa 'spring-public-http-smoke.json')
    foreach($check in $checks.GetEnumerator()){if(-not $check.Value){throw ('Synthetic smoke check failed: '+$check.Key)}}
    Write-Output ('SPRING_HTTP_SMOKE_PASS assertions='+$checks.Count)
} finally {
    if(-not $server.HasExited){Stop-Process -Id $server.Id}
}
