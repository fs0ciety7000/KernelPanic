import type { System } from '../../host';

// Hand-written pages for the commands an investigator needs most. Others fall back to usage.
const PAGES: Record<string, string> = {
  grep: `GREP(1)                         User Commands                        GREP(1)

NAME
       grep - print lines that match patterns

SYNOPSIS
       grep [OPTION...] PATTERNS [FILE...]

OPTIONS
       -i     ignore case          -v   invert match
       -n     line numbers         -c   count matching lines
       -r     recursive            -l   list matching files only
       -o     only matching part   -E   extended regex (default here)

EXAMPLES
       grep -i "failed" /var/log/auth.log
       grep -rn "password" ~/Documents
       cat mail.eml | grep -E "^(From|Received):"
`,
  find: `FIND(1)

NAME
       find - search for files in a directory hierarchy

SYNOPSIS
       find [PATH...] [-name PATTERN] [-iname PATTERN] [-type f|d|l]
            [-user NAME] [-perm MODE] [-newer FILE] [-maxdepth N]

EXAMPLES
       find / -name "*.sh" 2>/dev/null
       find ~ -name ".*" -type d        # hidden directories
       find /tmp -newer /etc/hostname   # recently modified files
`,
  sudo: `SUDO(8)

NAME
       sudo - execute a command as another user (root by default)

SYNOPSIS
       sudo COMMAND     run one command as root
       sudo -i          open a root shell
       sudo -l          list your privileges
       sudo -k          forget cached credentials

       Asks for YOUR password (not root's). Credentials are cached 5 minutes.
       Every invocation is logged to /var/log/auth.log.
`,
  base64: `BASE64(1)

NAME
       base64 - base64 encode/decode data

SYNOPSIS
       base64 [-d] [FILE]

EXAMPLES
       echo "aGVsbG8=" | base64 -d
       base64 -d encoded.txt
`,
  crontab: `CRONTAB(1)

NAME
       crontab - maintain crontab files for individual users

SYNOPSIS
       crontab [-u USER] -l

       Format of an entry:  MIN HOUR DOM MON DOW  COMMAND
       "*/10 * * * *" means every ten minutes.
`,
  strings: `STRINGS(1)

NAME
       strings - print the sequences of printable characters in files

SYNOPSIS
       strings [-n MIN] FILE...

       Useful to peek inside binaries, firmware images and unknown data.
`,
  open: `OPEN(1)                       Kernel_Panic Desktop

NAME
       open - open a file or application on the desktop

SYNOPSIS
       open FILE            open with the default app (by extension)
       open URL             open a web page in the browser (https://…, file://…)
       open -a APP [FILE]   force an app: files, terminal, notes, mail, images, logs,
                            browser, chat, case, settings
`,
  ls: `LS(1)

NAME
       ls - list directory contents

OPTIONS
       -a   include entries starting with .    -l   long listing (permissions, owner…)
       -h   human readable sizes               -t   sort by modification time
       -r   reverse order                      -d   list directories themselves
`,
  exiftool: `EXIFTOOL(1)

NAME
       exiftool - read meta information in image files

SYNOPSIS
       exiftool FILE...

       Shows camera model, timestamps, descriptions and other embedded tags.
`,
};

export function manPage(name: string, kernel: System): string | undefined {
  if (PAGES[name]) return PAGES[name];
  const scripted = kernel.scripted[name];
  if (scripted) {
    return `${name.toUpperCase()}(1)\n\nNAME\n       ${name} - ${scripted.summary ?? ''}\n\n${(scripted.fallback ?? '').replace(/^/gm, '       ')}\n`;
  }
  const def = kernel.commands.get(name);
  if (!def) return undefined;
  return `${name.toUpperCase()}(1)\n\nNAME\n       ${name} - ${def.summary}\n${def.usage ? `\nSYNOPSIS\n       ${def.usage}\n` : ''}`;
}
