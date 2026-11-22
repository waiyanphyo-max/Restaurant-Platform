$ErrorActionPreference = 'Stop'
$workspace = 'C:\RestaurantManagementSystem\Restaurant-Platform'
$pgBin = 'C:\Program Files\PostgreSQL\16\bin'
$log = Join-Path $workspace 'docs\qa\uxi-13\pg16-migrations.log'
$copyDirectory = Join-Path $workspace '.tmp\uxi-13-pg16\migrations'
New-Item -ItemType Directory -Path $copyDirectory -Force | Out-Null
function Invoke-QAPsql {
    param([string[]]$SqlArguments)
    & "$pgBin\psql.exe" -X -h 127.0.0.1 -p 55413 -U postgres -v ON_ERROR_STOP=1 @SqlArguments >> $log 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Disposable PostgreSQL command failed: exit $LASTEXITCODE. See $log" }
}
'PostgreSQL 16.4 compatibility equivalent ONLY. Exact PG17+ chain is blocked by PG18 initdb crash and unavailable Docker.' | Set-Content $log
Invoke-QAPsql @('-d','postgres','-c','CREATE DATABASE accounting_verify;')
$prerequisites = @'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, banned_until timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
'@
$prerequisiteFile = Join-Path $workspace '.tmp\uxi-13-pg16\prerequisites.sql'
[IO.File]::WriteAllText($prerequisiteFile, $prerequisites)
Invoke-QAPsql @('-d','accounting_verify','-f',$prerequisiteFile)
$inventory = @()
foreach ($migration in (Get-ChildItem (Join-Path $workspace 'supabase\migrations\*.sql') | Sort-Object Name)) {
    $source = [IO.File]::ReadAllText($migration.FullName)
    $compatibility = $source -replace '\bMAINTAIN,\s*',''
    $changed = $source -cne $compatibility
    $copy = Join-Path $copyDirectory $migration.Name
    [IO.File]::WriteAllText($copy, $compatibility)
    $inventory += [PSCustomObject]@{Name=$migration.Name; SourceSHA256=(Get-FileHash $migration.FullName -Algorithm SHA256).Hash; TempCopyChanged=$changed;Change= $(if($changed){'Remove PG17 MAINTAIN privilege token only'}else{'UNCHANGED'})}
    "APPLY $($migration.Name) temporary_copy_changed=$changed" | Add-Content $log
    Invoke-QAPsql @('-d','accounting_verify','-f',$copy)
}
$inventory | Export-Csv (Join-Path $workspace 'docs\qa\uxi-13\migration-source-inventory.csv') -NoTypeInformation
Invoke-QAPsql @('-d','accounting_verify','-c','SELECT version(); SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname=''public''; SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (''restaurant_runtime_branding'',''restaurant_bootstrap_steps'',''restaurant_featured_product'');')
'MIGRATION_COMPATIBILITY_EXIT=0' | Add-Content $log
Get-Content $log -Tail 20
