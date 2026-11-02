import json, os, sys, glob
out = sys.argv[1]
def inl(items, refs):
    s = ""
    for i in items or []:
        t = i.get("type")
        if t == "text": s += i["text"]
        elif t == "codeVoice": s += "`" + i["code"] + "`"
        elif t in ("emphasis", "strong", "newTerm"): s += inl(i.get("inlineContent"), refs)
        elif t == "reference":
            r = refs.get(i.get("identifier"), {})
            s += i.get("overridingTitle") or r.get("title") or ""
        elif t == "image": s += ""
        else: s += inl(i.get("inlineContent"), refs)
    return s
def blocks(bs, refs, ind=""):
    o = []
    for b in bs or []:
        t = b.get("type")
        if t == "heading": o.append("#" * (b["level"] + 1) + " " + b["text"])
        elif t == "paragraph": o.append(ind + inl(b["inlineContent"], refs))
        elif t in ("unorderedList", "orderedList"):
            for n, it in enumerate(b["items"], 1):
                body = blocks(it["content"], refs, ind + "  ")
                mark = "- " if t == "unorderedList" else f"{n}. "
                o.append(ind + mark + (body[0].strip() if body else "")); o += body[1:]
        elif t == "aside":
            o.append(ind + "> " + (b.get("name") or b.get("style", "Note")) + ": " + " ".join(x.strip() for x in blocks(b["content"], refs)))
        elif t == "table":
            for row in b["rows"]:
                o.append(ind + "| " + " | ".join(" ".join(x.strip() for x in blocks(c, refs)) for c in row) + " |")
        elif t == "codeListing": o.append("```\n" + "\n".join(b["code"]) + "\n```")
        elif t == "links": pass
    return o
for f in sorted(glob.glob(os.path.join(out, "raw", "*.json"))):
    d = json.load(open(f)); refs = d.get("references", {})
    title = d["metadata"].get("title", "")
    lines = ["# " + title, "", inl(d.get("abstract"), refs), ""]
    for sec in d.get("primaryContentSections", []):
        lines += blocks(sec.get("content"), refs) + [""]
    open(os.path.join(out, "md", os.path.basename(f)[:-5] + ".md"), "w").write("\n".join(lines))
