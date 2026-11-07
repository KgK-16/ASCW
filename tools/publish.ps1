# Publishes the Obsidian vault to the site: notes go to content/ unchanged, byte for byte; everything Obsidian-specific is handled when the
# site is built (layouts/partials/body.html, layouts/_markup/). No AI takes part. Rules for the author: "Как публиковать.md" in the vault.
#
#   Публикация/**.md       a note is a page when it has "publish: true". Every note carries its language in its name: "Archive.en.md",
#                          "Архив.ру.md"; the name is its title. The two languages are equal: notes with the same "slug" are one page
#   -> content/<path>/_index.<en|ru>.md   a copy of the note; a page without text in one language gets the other language's note
#   -> static/notes/       the pictures the notes use
#   -> data/notes.json     names of notes -> addresses, titles, pictures
#   -> data/text.json      interface texts, from the notes with "system: interface"
#
# tools/publish.ps1          everything, then a commit and a push
# tools/publish.ps1 -Local   only updates the files here (no git)
param([switch]$Local)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$repo = Split-Path $PSScriptRoot
$vault = Join-Path (Split-Path $repo) 'Obsidian Storage'
$root = Join-Path $vault 'Публикация'
$utf8 = New-Object Text.UTF8Encoding($false, $true)
$imageTypes = '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'
$errors = New-Object Collections.ArrayList
$warnings = New-Object Collections.ArrayList

function Stop-With($message) { Write-Host "`n$message" -ForegroundColor Red; exit 1 }
function Relative($path) { $path.Substring($vault.Length + 1).Replace('\', '/') }

function Read-Properties($text) { # the note's properties: top-level "key: value" lines (other YAML is left to Hugo)
  $props = @{}
  $m = [regex]::Match($text, '\A---[ \t]*\r?\n(.*?)^---[ \t]*(\r?\n|\z)', 'Singleline, Multiline')
  if (-not $m.Success) { return @{ props = $props; body = $text } }
  foreach ($line in $m.Groups[1].Value -split '\r?\n') {
    $p = [regex]::Match($line, '^([A-Za-z_][\w-]*):[ \t]*(.*?)[ \t]*$')
    if (-not $p.Success) { continue }
    $v = $p.Groups[2].Value
    if ($v -match '^[>|][+-]?$') { continue } # a multi-line value: Hugo reads it
    if ($v -match '^"(.*)"$') { $v = $Matches[1].Replace('\"', '"').Replace('\\', '\') }
    elseif ($v -match "^'(.*)'$") { $v = $Matches[1].Replace("''", "'") }
    $props[$p.Groups[1].Value.ToLower()] = $v
  }
  @{ props = $props; body = $text.Substring($m.Length) }
}

$letters = @{ а='a';б='b';в='v';г='g';д='d';е='e';ё='e';ж='zh';з='z';и='i';й='y';к='k';л='l';м='m';н='n';о='o';п='p';р='r';с='s';т='t';у='u';ф='f';х='h';ц='ts';ч='ch';ш='sh';щ='sch';ъ='';ы='y';ь='';э='e';ю='yu';я='ya' }
function Slug($name) { # a part of an address: Latin letters, digits and dashes
  $s = -join ($name.ToLower().ToCharArray() | ForEach-Object { $k = [string]$_; if ($letters.ContainsKey($k)) { $letters[$k] } else { $k } })
  ($s -replace '[^a-z0-9]+', '-').Trim('-')
}

# ---------- read the notes ----------
if (-not (Test-Path -LiteralPath $root)) { Stop-With "Нет папки $root" }
$notes = New-Object Collections.ArrayList
$interface = @{ en = [ordered]@{}; ru = [ordered]@{} }
$skipped = 0
foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.md) {
  $bytes = [IO.File]::ReadAllBytes($file.FullName)
  try { $text = $utf8.GetString($bytes).TrimStart([char]0xFEFF) } catch { [void]$errors.Add("$(Relative $file.FullName): файл не в UTF-8"); continue }
  $read = Read-Properties $text
  $wanted = $read.props.publish -eq 'true' -or $read.props.system -eq 'interface'
  if ($file.BaseName -notmatch '^(.+)\.(en|ру)$') {
    if ($wanted) { [void]$errors.Add("$(Relative $file.FullName): в имени нет языка; нужно «Название.ру.md» или «Name.en.md»") } else { $skipped++ }
    continue
  }
  $base = $Matches[1]
  $lang = if ($Matches[2] -eq 'en') { 'en' } else { 'ru' }
  if ($read.props.system -eq 'interface') {
    foreach ($k in $read.props.Keys) { if ($k -ne 'system') { $interface[$lang][$k] = $read.props[$k] } }
    continue
  }
  if (-not $wanted) { $skipped++; continue }
  [void]$notes.Add(@{ file = $file; base = $base; lang = $lang; dir = $file.DirectoryName; props = $read.props; body = $read.body; bytes = $bytes })
}

if (-not ($notes | Where-Object { $_.props.home -eq 'true' })) { [void]$errors.Add('Нет главной страницы (заметки с home: true и publish: true). Это защита: без неё сайт опубликовался бы пустым') }

# ---------- addresses: folders are sections; "slug" or the transliterated name is the address ----------
function Group-Slug($dir, $base) { # the "slug" of the note with this name
  foreach ($n in $notes) { if ($n.dir -eq $dir -and $n.base -eq $base -and $n.props.slug) { return $n.props.slug } }
  ''
}
$folderPaths = @{}
function Folder-Path($dir) {
  if ($dir -eq $root) { return '' }
  if ($folderPaths.ContainsKey($dir)) { return $folderPaths[$dir] }
  $name = Split-Path $dir -Leaf
  $parent = Split-Path $dir
  $slug = Group-Slug $dir $name                               # the section's note inside its folder...
  if (-not $slug) { $slug = Group-Slug $parent $name }        # ...or next to it
  if (-not $slug) { $slug = Slug $name }
  $folderPaths[$dir] = (Folder-Path $parent) + '/' + $slug
  $folderPaths[$dir]
}
foreach ($n in $notes) {
  if ($n.props.home -eq 'true') { $n.path = '/' }
  else {
    $slug = $n.props.slug
    if (-not $slug) { $slug = Slug $n.base; [void]$warnings.Add("$(Relative $n.file.FullName): нет slug, вторая языковая версия не свяжется с этой заметкой") }
    $folder = Folder-Path $n.dir
    $n.path = if ($folder -and $slug -eq ($folder -split '/')[-1]) { $folder } else { "$folder/$slug" } # a note with its folder's slug is the section's page
  }
  if ($n.path -ne '/' -and $n.path -notmatch '^(/[a-z0-9][a-z0-9-]*)+$') { [void]$errors.Add("$(Relative $n.file.FullName): нельзя собрать адрес ($($n.path)); задайте slug латиницей") }
  if ($n.path -eq '/map' -or $n.path -like '/map/*') { [void]$errors.Add("$(Relative $n.file.FullName): адрес /map занят картой мира") }
  if ($n.body -match '(?s)%%' -and (($n.body -replace '(?s)```.*?```', '') -replace '`[^`\n]*`', '') -match '%%') {
    [void]$errors.Add("$(Relative $n.file.FullName): скрытый комментарий %%…%% будет виден всем на GitHub; удалите его из этой заметки")
  }
}

# ---------- pages: one or two notes each; sections of published pages exist even without a note of their own ----------
$pages = @{}
foreach ($n in $notes) {
  if (-not $pages.ContainsKey($n.path)) { $pages[$n.path] = @{} }
  if ($pages[$n.path].ContainsKey($n.lang)) { [void]$errors.Add("Два файла на один адрес $($n.path): $(Relative $pages[$n.path][$n.lang].file.FullName) и $(Relative $n.file.FullName)") }
  $pages[$n.path][$n.lang] = $n
}
foreach ($page in $pages.Values) { # the two versions of a page have equal properties (their texts, titles and descriptions are their own)
  if ($page.Count -lt 2) { continue }
  foreach ($k in 'weight', 'head', 'links', 'tall', 'bg') {
    if ($page.ru.props[$k] -ne $page.en.props[$k]) { [void]$warnings.Add("$(Relative $page.ru.file.FullName) и $(Relative $page.en.file.FullName): свойство $k различается") }
  }
}
$sections = @{}
foreach ($n in $notes) {
  if ($n.props.home -eq 'true') { continue } # the home page's folder is only a place for its two notes
  $dir = $n.dir
  while ($dir -ne $root -and $dir.Length -gt $root.Length) {
    $p = Folder-Path $dir
    if (-not $pages.ContainsKey($p)) { $sections[$p] = Split-Path $dir -Leaf }
    $dir = Split-Path $dir
  }
}

# ---------- the map's pages: the map folder (Карта, its note's slug "places") and the folders in it; the map names them by slug alone ----------
$mapFolder = '/places'
$mapPages = @{}
foreach ($path in @($pages.Keys) + @($sections.Keys)) {
  if ($path -notlike "$mapFolder/*") { continue }
  $slug = ($path -split '/')[-1]
  if ($mapPages.ContainsKey($slug)) { [void]$errors.Add("В папке карты две страницы со slug «$slug» ($($mapPages[$slug]) и $path); карта не поймёт, какую открыть") }
  $mapPages[$slug] = $path
}

# ---------- names -> addresses ----------
$links = @{}
$taken = @{}
function Add-Link($key, $path) {
  $key = $key.ToLower()
  if ($taken.ContainsKey($key) -and $taken[$key] -ne $path) { $links.Remove($key); [void]$warnings.Add("Заметки с одинаковым именем «$key»: в ссылках на них указывайте путь"); return }
  $taken[$key] = $path
  $links[$key] = $path
}
foreach ($n in $notes) {
  $full = (Relative $n.file.FullName) -replace '\.md$', ''
  Add-Link $n.file.BaseName $n.path
  Add-Link $n.base $n.path
  Add-Link $full $n.path
  Add-Link ($full -replace '^[^/]+/', '') $n.path
}

# ---------- pictures: only those the notes use ----------
$vaultFiles = @{}
$sameName = @{}
foreach ($f in Get-ChildItem -LiteralPath $vault -Recurse -File | Where-Object { $imageTypes -contains $_.Extension.ToLower() -and $_.FullName -notlike "*\.obsidian\*" -and $_.FullName -notlike "*\.trash\*" }) {
  $key = $f.Name.ToLower()
  if ($vaultFiles.ContainsKey($key)) { $sameName[$key] = 1 }
  $vaultFiles[$key] = $f
}
$images = @{}
function Use-Image($name, $where) {
  $key = $name.Trim().ToLower()
  if ($images.ContainsKey($key)) { return }
  if ($sameName.ContainsKey($key)) { [void]$errors.Add("${where}: в хранилище несколько картинок с именем «$name»; переименуйте их, чтобы на сайт не попала другая") }
  elseif ($vaultFiles.ContainsKey($key)) {
    $f = $vaultFiles[$key]
    $hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.Substring(0, 8).ToLower()
    $images[$key] = @{ file = $f; site = "notes/$(Slug $f.BaseName)-$hash$($f.Extension.ToLower())" }
  } else { [void]$warnings.Add("${where}: нет картинки «$name» в хранилище") }
}
foreach ($n in $notes) {
  $where = Relative $n.file.FullName
  if ($n.props.bg -and $n.props.bg -ne 'none' -and -not (Test-Path -LiteralPath (Join-Path $repo "static\$($n.props.bg)"))) { Use-Image $n.props.bg $where } # not one of the site's own
  $text = ($n.body -replace '(?s)```.*?```', '') -replace '`[^`\n]*`', '' # code examples are not links
  foreach ($m in [regex]::Matches($text, '(!?)\[\[([^\]\r\n]+)\]\]')) {
    $target = (($m.Groups[2].Value -split '\|')[0]).Trim()
    $target = $target.Replace('\', '')
    if ($m.Groups[1].Value -and $imageTypes -contains [IO.Path]::GetExtension($target).ToLower()) { Use-Image (Split-Path $target -Leaf) $where; continue }
    $name = ($target -split '#')[0]
    if ($name -and -not $links.ContainsKey($name.ToLower())) { [void]$warnings.Add("${where}: ссылка на неопубликованную заметку «$name» станет простым текстом, но её имя видно на GitHub") }
  }
  foreach ($m in [regex]::Matches($n.body, '!\[[^\]\r\n]*\]\(([^)\s]+)\)')) {
    if ($m.Groups[1].Value -notmatch '^(https?:)?//') { Use-Image (Split-Path ([uri]::UnescapeDataString($m.Groups[1].Value)) -Leaf) $where }
  }
}

if ($errors.Count) {
  Write-Host "`nПубликация остановлена, на сайте ничего не изменилось:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

# ---------- git: start from what is on GitHub (the map editor commits there) ----------
function Invoke-Git { # git.exe, not "git": PowerShell ignores case, so a function named Git would call itself
  $ErrorActionPreference = 'Continue' # git writes progress and notes to stderr; its exit code tells whether it failed
  & git.exe -C $repo -c core.safecrlf=false @args # no line-ending notes for every file
  if ($LASTEXITCODE) { Stop-With "Команда git $($args -join ' ') завершилась с ошибкой" }
}
$managed = 'content', 'data/notes.json', 'data/text.json', 'static/notes'
if (-not $Local) {
  if ((& git.exe -C $repo branch --show-current) -ne 'main') { Stop-With 'Папка сайта не на ветке main; переключите её на main и повторите.' }
  $others = @(& git.exe -C $repo status --porcelain | Where-Object { $p = $_.Substring(3).Trim('"'); -not ($managed | Where-Object { $p -eq $_ -or $p.StartsWith("$_/") }) })
  if ($others) { Write-Host ($others -join "`n"); Stop-With 'В папке сайта есть другие незакоммиченные изменения; сначала разберитесь с ними.' }
  Invoke-Git pull --ff-only --quiet origin main
}

# ---------- write the files ----------
Get-ChildItem -LiteralPath (Join-Path $repo 'content') -Force | Where-Object { $_.Name -ne 'map' } | Remove-Item -Recurse -Force
$notesDir = Join-Path $repo 'static\notes'
if (Test-Path -LiteralPath $notesDir) { Remove-Item -LiteralPath $notesDir -Recurse -Force }
function Write-Bytes($path, [byte[]]$bytes) {
  $dir = Split-Path $path
  if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
  [IO.File]::WriteAllBytes($path, $bytes)
}
$pageData = @{}
foreach ($path in $pages.Keys) {
  $page = $pages[$path]
  $dir = Join-Path $repo ('content' + $path.Replace('/', '\'))
  $entry = @{}
  foreach ($lang in 'en', 'ru') {
    $other = if ($lang -eq 'en') { 'ru' } else { 'en' }
    $own = if ($page.ContainsKey($lang)) { $page[$lang] } else { $page[$other] } # its title and description
    $source = $own                                                                # its text: an empty note shows the other language's
    if (-not $own.body.Trim() -and $page.ContainsKey($other) -and $page[$other].body.Trim()) { $source = $page[$other] }
    $target = Join-Path $dir "_index.$lang.md"
    Write-Bytes $target $source.bytes
    if (-not [Linq.Enumerable]::SequenceEqual([byte[]][IO.File]::ReadAllBytes($target), [byte[]]$source.bytes)) { Stop-With "Копия отличается от заметки: $target" }
    $data = @{ title = $(if ($own.props.title) { $own.props.title } else { $own.base }) }
    if ($own.props.description) { $data.description = $own.props.description }
    if ($source.lang -ne $lang) { $data.from = $source.lang }
    $entry[$lang] = $data
  }
  $pageData[$path] = $entry
}
foreach ($path in $sections.Keys) { # a folder without its own note: a page with its name and the list of its pages
  $name = $sections[$path]
  $dir = Join-Path $repo ('content' + $path.Replace('/', '\'))
  foreach ($lang in 'en', 'ru') { Write-Bytes (Join-Path $dir "_index.$lang.md") ([Text.Encoding]::UTF8.GetBytes("---`ntitle: `"$($name.Replace('"', '\"'))`"`n---`n")) }
  $pageData[$path] = @{ en = @{ title = $name }; ru = @{ title = $name } }
}
$imageData = @{}
foreach ($k in $images.Keys) {
  $imageData[$k] = $images[$k].site
  Write-Bytes (Join-Path $repo ('static\' + $images[$k].site.Replace('/', '\'))) ([IO.File]::ReadAllBytes($images[$k].file.FullName))
}
$plain = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $repo 'data\notes.json'), (@{ pages = $pageData; links = $links; images = $imageData } | ConvertTo-Json -Depth 6), $plain)
if ($interface.ru.Count -or $interface.en.Count) {
  $texts = [ordered]@{}
  foreach ($k in $interface.en.Keys) { $texts[$k] = [ordered]@{ en = $interface.en[$k]; ru = $interface.ru[$k] } }
  foreach ($k in $interface.ru.Keys) { if (-not $texts.Contains($k)) { $texts[$k] = [ordered]@{ en = $interface.ru[$k]; ru = $interface.ru[$k] } } }
  [IO.File]::WriteAllText((Join-Path $repo 'data\text.json'), ($texts | ConvertTo-Json -Depth 3), $plain)
}

# the pages the map opens (its data as on GitHub, after the pull: the map editor saves it there)
if (-not $mapPages.Count) { [void]$warnings.Add("Нет папки карты: заметки со slug: places, названной как её папка (Карта/Карта.ру.md). Окна стран и меток будут пустыми") }
$mapLinks = @()
foreach ($q in (Get-Content -LiteralPath (Join-Path $repo 'assets\markers.json') -Raw -Encoding UTF8 | ConvertFrom-Json)) { if ($q.pg) { $mapLinks += , @("метка «$($q.r)»", $q.pg) } }
foreach ($c in (Get-Content -LiteralPath (Join-Path $repo 'assets\countries.json') -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties) { if ($c.Value.pg) { $mapLinks += , @("страна $($c.Name)", $c.Value.pg) } }
foreach ($l in $mapLinks) { if (-not $mapPages.ContainsKey($l[1])) { [void]$warnings.Add("Карта: $($l[0]) открывает страницу «$($l[1])», которой нет в папке карты; её окно будет пустым") } }

# ---------- check the build, then publish ----------
Write-Host "Страниц: $($pages.Count + $sections.Count), картинок: $($images.Count), пропущено заметок без publish: true: $skipped"
$warnings | Select-Object -Unique | ForEach-Object { Write-Host "  ! $_" -ForegroundColor Yellow }
if (Get-Command hugo -ErrorAction SilentlyContinue) {
  $check = Join-Path $env:TEMP "ascw-check-$PID"
  & hugo --source $repo --quiet --destination $check
  $ok = $LASTEXITCODE -eq 0
  Remove-Item -LiteralPath $check -Recurse -Force -ErrorAction SilentlyContinue
  if (-not $ok) { Stop-With 'Сайт не собрался, на GitHub ничего не отправлено. Чаще всего дело в ошибке в свойствах заметки.' }
}
if ($Local) { Write-Host 'Файлы обновлены локально, на GitHub ничего не отправлено.'; exit 0 }

Invoke-Git add -A # the check above: nothing else has changed
& git.exe -C $repo diff --cached --quiet
if ($LASTEXITCODE) { Invoke-Git -c 'user.name=KgK-16' -c 'user.email=KgK-16@users.noreply.github.com' commit --quiet -m 'Publish notes from Obsidian' } # this computer has no git identity of its own
if ([int](& git.exe -C $repo rev-list --count 'origin/main..HEAD') -eq 0) { Write-Host 'Изменений нет, сайт уже актуален.' -ForegroundColor Green; exit 0 }
Invoke-Git push --quiet origin main # also commits an earlier run could not send
Write-Host 'Готово: сайт обновится примерно через минуту.' -ForegroundColor Green
