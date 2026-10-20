/** Split a single-part MusicXML sight-reading score at encoded system boundaries.
 * Each A4 sheet contains at most eight systems. The exported MusicXML remains
 * a single editable 16-system document; only PDF pagination uses this split.
 */
export function paginateSightReadingXml(xml: string, systemsPerPage = 8): string[] {
  if (!Number.isInteger(systemsPerPage) || systemsPerPage < 1 || systemsPerPage > 8)
    throw new Error('Invalid maximum systems per page');
  const parts = xml.match(/<part\s+id=["'][^"']+["']>/g) || [];
  if (parts.length !== 1) throw new Error('Only single-part sight-reading is supported for PDF pagination');
  const match = /<measure\b[^>]*>[\s\S]*?<\/measure>/g;
  const measures = [...xml.matchAll(match)];
  if (!measures.length) throw new Error('No measures found in sight-reading MusicXML');
  const firstIndex = measures[0].index;
  const last = measures[measures.length - 1];
  const prefix = xml.slice(0, firstIndex);
  const suffix = xml.slice((last.index ?? 0) + last[0].length);
  const attributes = measures[0][0].match(/<attributes>[\s\S]*?<\/attributes>/)?.[0];
  if (!attributes) throw new Error('No opening MusicXML attributes to repeat after page break');
  const groups: string[][] = [];
  let current: string[] = [];
  let systems = 0;
  for (const entry of measures) {
    const measure = entry[0];
    const newSystem = /<print\b[^>]*\bnew-system=["']yes["']/.test(measure);
    if (newSystem && current.length && systems >= systemsPerPage) {
      groups.push(current);
      current = [];
      systems = 0;
    }
    if (newSystem || current.length === 0) systems++;
    current.push(measure);
  }
  if (current.length) groups.push(current);
  return groups.map((group, page) => {
    if (page > 0) {
      group[0] = group[0].replace(/<print\b[^>]*\/\s*>/, '');
      if (!group[0].includes('<attributes>')) {
        group[0] = group[0].replace(/(<measure\b[^>]*>)/, '$1' + attributes);
      }
    }
    return prefix + group.join('') + suffix;
  });
}
