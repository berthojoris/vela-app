import { Braces, File, FileCode2, FileJson2, FileText, Image, Settings2, Terminal } from 'lucide-react';

export function FileIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const [Icon, color] = /^(package.*\.json|.*\.jsonc?)$/i.test(name)
    ? [FileJson2, 'text-orca-amber']
    : ['ts', 'tsx'].includes(ext ?? '')
      ? [FileCode2, 'text-blue-400']
      : ['js', 'jsx', 'mjs', 'cjs'].includes(ext ?? '')
        ? [FileCode2, 'text-yellow-400']
        : ['rs', 'go', 'py', 'java', 'kt', 'swift', 'c', 'cpp', 'h'].includes(ext ?? '')
          ? [FileCode2, 'text-orange-400']
          : ['html', 'vue', 'svelte'].includes(ext ?? '')
            ? [FileCode2, 'text-orange-400']
            : ['css', 'scss', 'sass'].includes(ext ?? '')
              ? [Braces, 'text-violet-400']
              : ['md', 'txt', 'log'].includes(ext ?? '')
                ? [FileText, 'text-sky-300']
                : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext ?? '')
                  ? [Image, 'text-orca-emerald']
                  : ['sh', 'ps1', 'bat', 'cmd'].includes(ext ?? '')
                    ? [Terminal, 'text-orca-emerald']
                    : ['toml', 'yaml', 'yml', 'ini', 'lock'].includes(ext ?? '') || name.startsWith('.')
                      ? [Settings2, 'text-orca-muted']
                      : [File, 'text-orca-muted'];
  return <Icon aria-hidden="true" className={`${className} ${color} shrink-0`} strokeWidth={1.6} />;
}
