# Lists the export names of a PE file (used to confirm ZyPrinter.dll entry points).
param([Parameter(Mandatory = $true)][string]$Path)

$bytes = [System.IO.File]::ReadAllBytes($Path)
$peOff = [BitConverter]::ToInt32($bytes, 0x3C)
$magic = [BitConverter]::ToUInt16($bytes, $peOff + 24)
$optOff = $peOff + 24
$dirOff = if ($magic -eq 0x10b) { $optOff + 96 } else { $optOff + 112 }

$exportRva = [BitConverter]::ToUInt32($bytes, $dirOff)
if ($exportRva -eq 0) { Write-Output "no exports"; exit }

# Section headers, to map RVA -> file offset
$numSections = [BitConverter]::ToUInt16($bytes, $peOff + 6)
$optSize = [BitConverter]::ToUInt16($bytes, $peOff + 20)
$secOff = $optOff + $optSize

$sections = @()
for ($i = 0; $i -lt $numSections; $i++) {
    $s = $secOff + ($i * 40)
    $sections += [pscustomobject]@{
        VirtualAddress = [BitConverter]::ToUInt32($bytes, $s + 12)
        VirtualSize    = [BitConverter]::ToUInt32($bytes, $s + 8)
        RawPointer     = [BitConverter]::ToUInt32($bytes, $s + 20)
    }
}

function Convert-Rva([uint32]$rva) {
    foreach ($s in $sections) {
        if ($rva -ge $s.VirtualAddress -and $rva -lt ($s.VirtualAddress + [Math]::Max($s.VirtualSize, 1))) {
            return $s.RawPointer + ($rva - $s.VirtualAddress)
        }
    }
    return 0
}

$dir = Convert-Rva $exportRva
$nameCount = [BitConverter]::ToUInt32($bytes, $dir + 24)
$namesRva = [BitConverter]::ToUInt32($bytes, $dir + 32)
$namesOff = Convert-Rva $namesRva

for ($i = 0; $i -lt $nameCount; $i++) {
    $strRva = [BitConverter]::ToUInt32($bytes, $namesOff + ($i * 4))
    $strOff = Convert-Rva $strRva
    $end = $strOff
    while ($bytes[$end] -ne 0) { $end++ }
    [System.Text.Encoding]::ASCII.GetString($bytes, $strOff, $end - $strOff)
}
