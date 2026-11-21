/** Return one active navigation item per page.
 * A locale root such as /en is not a parent tab for /en/weekly.
 */
export function isNavActive(path: string, href: string): boolean {
  const current = path.replace(/\/+$/, "") || "/";
  const target = href.replace(/\/+$/, "") || "/";
  const depth = target.split("/").filter(Boolean).length;
  return current === target || (depth > 1 && current.startsWith(target + "/"));
}
