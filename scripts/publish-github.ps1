#Requires -Version 5.1
<#
.SYNOPSIS
Preview or publish the current MathInput branch to GitHub.
.DESCRIPTION
Stages all non-ignored changes, commits them, and pushes the current branch.
Without origin, uses GitHub CLI to connect to or create the named repository.
New repositories are private unless -Visibility Public is supplied.
#>
[CmdletBinding()]
param(
    [string]$Repository,
    [ValidateSet('Private', 'Public')]
    [string]$Visibility = 'Private',
    [ValidateNotNullOrEmpty()]
    [string]$Message = 'Update Math Input',
    [switch]$Preview
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoName = '[a-z0-9-]+/[a-z0-9_.-]+'
$githubUrl = "^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)(?<name>${repoName}?)(?:\.git)?/?$"

function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed (git $($args[0]), exit $LASTEXITCODE)."
    }
}

function Get-GitHubOrigin {
    $urls = @(Invoke-Git remote get-url --push --all origin)
    if ($urls.Count -ne 1 -or $urls[0] -notmatch $githubUrl) {
        throw 'origin must have exactly one GitHub.com push URL without embedded credentials.'
    }
    return $Matches['name']
}

function Find-GitHubRepository([string]$Url) {
    # Windows PowerShell can treat native stderr as terminating on redirection.
    $ErrorActionPreference = 'Continue'
    $name = & gh repo view $Url --json nameWithOwner --jq '.nameWithOwner' 2>$null
    if ($LASTEXITCODE -eq 0) { return $name }
}

if (-not (Get-Command git -CommandType Application -ErrorAction SilentlyContinue)) {
    throw 'Git is required. Install Git for Windows and reopen PowerShell.'
}
if ($Repository -and ($Repository -notmatch "^$repoName$" -or $Repository -match '/\.{1,2}$|\.git$')) {
    throw 'Use -Repository OWNER/REPO, for example octocat/MathInput.'
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
$previousGhHost = $env:GH_HOST
try {
    $gitRoot = Invoke-Git rev-parse --show-toplevel
    if ([IO.Path]::GetFullPath($gitRoot) -ne [IO.Path]::GetFullPath($root)) {
        throw 'Run the script from the scripts directory of the repository.'
    }
    $branch = Invoke-Git branch --show-current
    if (-not $branch) { throw 'Check out a branch before publishing.' }
    $hasOrigin = @(Invoke-Git remote) -contains 'origin'
    if ($hasOrigin) {
        $destination = Get-GitHubOrigin
        if ($Repository -and $Repository -ne $destination) {
            throw 'The repository argument does not match the push destination of origin.'
        }
    } else {
        if (-not $Repository) { throw 'No origin is configured. Supply -Repository OWNER/REPO.' }
        $destination = $Repository
    }

    $ignoredTracked = @(Invoke-Git ls-files -ci --exclude-standard)
    if ($ignoredTracked.Count) {
        $ignoredTracked | ForEach-Object { Write-Host "Tracked and ignored: $_" }
        throw 'Review tracked files matched by .gitignore before publishing.'
    }

    Write-Host "Branch: $branch"
    Write-Host "Target: https://github.com/$destination"
    if (-not $hasOrigin) { Write-Host "Visibility if created: $Visibility" }
    Invoke-Git --no-optional-locks status --short --untracked-files=all
    if ($Preview) { return }

    if (-not $hasOrigin) {
        if (-not (Get-Command gh -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'GitHub CLI is required for the first publish. See docs/PUBLISH_GITHUB.md.'
        }
        $env:GH_HOST = 'github.com'
        & gh auth status --hostname github.com
        if ($LASTEXITCODE -ne 0) { throw 'Sign in with gh auth login before publishing.' }
    }

    Invoke-Git add -A
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        Invoke-Git commit -m $Message
    } elseif ($LASTEXITCODE -ne 0) {
        throw 'Unable to read staged changes.'
    }

    if (-not $hasOrigin) {
        $remoteUrl = "https://github.com/$destination.git"
        $existing = Find-GitHubRepository $remoteUrl
        if (-not $existing) {
            & gh repo create $destination ("--" + $Visibility.ToLowerInvariant())
            if ($LASTEXITCODE -ne 0) { throw 'Unable to create the GitHub repository.' }
        } elseif ($existing -ne $destination) {
            throw 'GitHub resolved the requested name to a different repository.'
        }
        Invoke-Git remote add origin $remoteUrl
        if ((Get-GitHubOrigin) -ne $destination) {
            throw 'The configured push destination differs from the requested GitHub repository.'
        }
    }

    Invoke-Git push --set-upstream --no-follow-tags origin "refs/heads/$($branch):refs/heads/$branch"
    Write-Host "Published $branch to https://github.com/$destination"
}
finally {
    $env:GH_HOST = $previousGhHost
    Pop-Location
}
