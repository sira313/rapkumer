# Code Signing Configuration for Rapkumer
# This script manages signtool paths and certificate configuration

# Detect the appropriate signtool.exe path
function Get-SignToolPath {
    # Known working path based on system check
    $knownPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
    if (Test-Path $knownPath) {
        return $knownPath
    }
    
    # Fallback to other known paths
    $fallbackPaths = @(
        "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
        "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\signtool.exe"
    )
    
    foreach ($path in $fallbackPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    throw "SignTool.exe not found. Please install Windows SDK."
}

# Certificate configuration
$CertConfig = @{
    # Certificate store options (if using certificate store)
    StoreName = "My"  # Personal certificate store
    UseUserStore = $false  # Use machine store by default
    
    # PFX file options (if using PFX file)
    PfxPath = "$PSScriptRoot\..\cert\codesign.pfx"
    PasswordFile = "$PSScriptRoot\..\cert\password.txt"
    
    # Subject name search (if using certificate store)
    SubjectName = "Apoxicam"  # Adjust this to match your certificate
    
    # Timestamping - list of fallback servers (will be tried in order)
    TimestampUrls = @(
        "http://timestamp.digicert.com",
        "http://timestamp.sectigo.com",
        "http://timestamp.globalsign.com/rfc3161",
        "http://timestamp.comodoca.com/authenticode"
    )
    TimestampAlgorithm = "SHA256"
    
    # File digest algorithm
    DigestAlgorithm = "SHA256"
    
    # Description for signed files
    Description = "Administrasi guru terpadu"
    DescriptionUrl = "https://github.com/sira313/raporkumer"
}

# Get the signing command based on available certificate
function Get-SignCommand {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        
        [string]$SignToolPath = (Get-SignToolPath),
        [string]$TimestampUrl
    )
    
    # Use provided timestamp URL if supplied, otherwise fall back to first configured URL
    $useTimestamp = $TimestampUrl
    if (-not $useTimestamp) {
        if ($CertConfig.ContainsKey('TimestampUrls') -and $CertConfig.TimestampUrls.Count -gt 0) {
            $useTimestamp = $CertConfig.TimestampUrls[0]
        } else {
            $useTimestamp = $CertConfig.TimestampUrl
        }
    }

    $baseArgs = @(
        "sign",
        "/fd", $CertConfig.DigestAlgorithm,
        "/v"  # Verbose output
    )

    # Add timestamp arguments only when a timestamp URL is available
    if ($useTimestamp) {
        $baseArgs += @("/tr", $useTimestamp, "/td", $CertConfig.TimestampAlgorithm)
    }

    # Add description fields (no extra embedded quotes — pass as separate args)
    if ($CertConfig.Description) { $baseArgs += @("/d", $CertConfig.Description) }
    if ($CertConfig.DescriptionUrl) { $baseArgs += @("/du", $CertConfig.DescriptionUrl) }
    
    # Check if PFX file exists and has password
    if ((Test-Path $CertConfig.PfxPath) -and (Test-Path $CertConfig.PasswordFile)) {
        # Resolve the PFX path to an absolute, normalized path to avoid ".." fragments
        $resolvedPfx = (Resolve-Path -Path $CertConfig.PfxPath).Path
        Write-Host "Using PFX certificate: $resolvedPfx" -ForegroundColor Green
        $password = Get-Content $CertConfig.PasswordFile -Raw
        # Pass the PFX path and password as separate arguments (no embedded quotes)
        $baseArgs += @("/f", $resolvedPfx, "/p", $password.Trim())
    }
    # Check if certificate is in store
    elseif ($CertConfig.SubjectName) {
        Write-Host "Using certificate store with subject: $($CertConfig.SubjectName)" -ForegroundColor Green
        $baseArgs += @("/n", $CertConfig.SubjectName)
        if (-not $CertConfig.UseUserStore) {
            $baseArgs += "/sm"  # Use machine store
        }
        $baseArgs += "/a"  # Automatically select best certificate
    }
    else {
        throw "No certificate configuration found. Please setup either PFX file or certificate store."
    }
    
    # Ensure the file path is an absolute path and pass it as a final argument
    $resolvedFile = (Resolve-Path -Path $FilePath).Path
    $baseArgs += $resolvedFile
    
    return @{
        Tool = $SignToolPath
        Arguments = $baseArgs
    }
}

# Verify if certificate is available
function Test-CertificateAvailable {
    try {
        if ((Test-Path $CertConfig.PfxPath) -and (Test-Path $CertConfig.PasswordFile)) {
            Write-Host "[OK] PFX certificate file found" -ForegroundColor Green
            return $true
        }
        
        # Check certificate store
        $store = if ($CertConfig.UseUserStore) { "CurrentUser" } else { "LocalMachine" }
        $certs = Get-ChildItem -Path "Cert:\$store\$($CertConfig.StoreName)" | 
                Where-Object { $_.Subject -like "*$($CertConfig.SubjectName)*" -and $_.HasPrivateKey }
        
        if ($certs) {
            Write-Host "[OK] Certificate found in store: $($certs[0].Subject)" -ForegroundColor Green
            return $true
        }
        
        Write-Warning "No suitable certificate found"
        return $false
    }
    catch {
        Write-Warning "Error checking certificate availability: $($_.Exception.Message)"
        return $false
    }
}

# Functions are automatically available when dot-sourced