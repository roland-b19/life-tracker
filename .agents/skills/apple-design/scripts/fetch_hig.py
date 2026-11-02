import json, sys, os, urllib.request, concurrent.futures as cf
out = sys.argv[1]
idx = json.load(open(os.path.join(out, "index.json")))
paths = []
def walk(n, trail):
    p = n.get("path")
    if p and n.get("type") in ("article", "symbol", "overview", "collectionGroup", "topic") and p.startswith("/design/human-interface-guidelines/"):
        paths.append((p, trail))
    for c in n.get("children", []) or []:
        walk(c, trail + [n.get("title", "")])
for root in idx["interfaceLanguages"]["swift"]:
    walk(root, [])
seen = {}
for p, t in paths: seen.setdefault(p, t)
print(len(seen), "pages")
def get(p):
    slug = p.rsplit("/", 1)[1]
    url = f"https://developer.apple.com/tutorials/data{p}.json"
    dest = os.path.join(out, "raw", slug + ".json")
    if os.path.exists(dest): return slug, True
    try:
        data = urllib.request.urlopen(url, timeout=40).read()
        open(dest, "wb").write(data); return slug, True
    except Exception as e:
        return slug, str(e)
with cf.ThreadPoolExecutor(8) as ex:
    res = list(ex.map(get, seen))
bad = [r for r in res if r[1] is not True]
print("failed:", bad)
json.dump({p: t for p, t in seen.items()}, open(os.path.join(out, "paths.json"), "w"))
