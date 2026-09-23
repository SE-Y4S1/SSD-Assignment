import subprocess, yaml, io, sys

REPO = r"C:/Users/LENOVO/Desktop/SSD-Analysis/SSD-Assignment"
r = subprocess.run(["kubectl", "kustomize", "k8s/"], cwd=REPO, capture_output=True, text=True,
                   encoding="utf-8", errors="replace", shell=True)
if r.returncode != 0:
    print("kustomize failed:", r.stderr[:500]); sys.exit(1)

docs = [d for d in yaml.safe_load_all(r.stdout) if d]
io.open("k8s-rendered.yaml", "w", encoding="utf-8", newline="\n").write(r.stdout)
print("kubectl kustomize rendered %d objects" % len(docs))

kinds = {}
for d in docs:
    kinds[d["kind"]] = kinds.get(d["kind"], 0) + 1
print("objects:", kinds)

APP = {'auth', 'notification', 'patient-management', 'doctor-management', 'appointment',
       'telemedicine', 'payment', 'ai-symptom-checker', 'frontend'}

results = []


def check(label, ok, detail=""):
    results.append((label, ok, detail))


# V-D21 image tags
imgs = []
for d in docs:
    if d["kind"] == "Deployment":
        for c in d["spec"]["template"]["spec"]["containers"]:
            imgs.append(c["image"])
app_imgs = [i for i in imgs if i.split(":")[0] in APP]
check("V-D21 no app image uses :latest", all(not i.endswith(":latest") for i in app_imgs),
      "tags: " + ", ".join(sorted(set(i.split(':')[-1] for i in app_imgs))))

# V-D22 NodePort
nodeports = [d["metadata"]["name"] for d in docs if d["kind"] == "Service" and d["spec"].get("type") == "NodePort"]
check("V-D22 no Service is type NodePort", not nodeports, "found: %s" % nodeports)

# V-D23 automount
bad = [d["metadata"]["name"] for d in docs if d["kind"] == "Deployment"
       and d["spec"]["template"]["spec"].get("automountServiceAccountToken") is not False]
check("V-D23 every pod disables the ServiceAccount token", not bad, "missing on: %s" % bad)

# V-D24 persistent storage
mongo = [d for d in docs if d["kind"] == "Deployment" and d["metadata"]["name"] == "mongo"][0]
vols = mongo["spec"]["template"]["spec"]["volumes"]
check("V-D24 mongo uses a PersistentVolumeClaim, not emptyDir",
      any("persistentVolumeClaim" in v for v in vols) and not any("emptyDir" in v for v in vols),
      str(vols))
check("V-D24 the claim exists", any(d["kind"] == "PersistentVolumeClaim" for d in docs))

# V-D12 security contexts, network policies, TLS, db auth
missing_pod = [d["metadata"]["name"] for d in docs if d["kind"] == "Deployment"
               and d["metadata"]["name"] in APP
               and d["spec"]["template"]["spec"].get("securityContext", {}).get("runAsNonRoot") is not True]
check("V-D12 app pods set runAsNonRoot", not missing_pod, "missing on: %s" % missing_pod)

missing_c = []
for d in docs:
    if d["kind"] == "Deployment" and d["metadata"]["name"] in APP:
        for c in d["spec"]["template"]["spec"]["containers"]:
            sc = c.get("securityContext", {})
            if sc.get("allowPrivilegeEscalation") is not False or sc.get("capabilities", {}).get("drop") != ["ALL"]:
                missing_c.append(d["metadata"]["name"])
check("V-D12 app containers drop capabilities and block privilege escalation", not missing_c,
      "missing on: %s" % missing_c)

pols = [d["metadata"]["name"] for d in docs if d["kind"] == "NetworkPolicy"]
check("V-D12 network policies present", len(pols) == 3, "policies: %s" % pols)

ing = [d for d in docs if d["kind"] == "Ingress"][0]
check("V-D12 ingress terminates TLS", bool(ing["spec"].get("tls")), str(ing["spec"].get("tls")))

dbauth = []
for d in docs:
    if d["kind"] == "Deployment":
        for c in d["spec"]["template"]["spec"]["containers"]:
            for e in c.get("env", []):
                if e["name"] == "MONGO_URI" and "@mongo:27017" not in e.get("value", ""):
                    dbauth.append(d["metadata"]["name"])
check("V-D12 every MONGO_URI authenticates", not dbauth, "unauthenticated in: %s" % dbauth)

# V-D27 rewrite annotation
ann = ing["metadata"].get("annotations") or {}
check("V-D27 no rewrite-target annotation", not any("rewrite-target" in k for k in ann), str(ann))
paths = [p["path"] for p in ing["spec"]["rules"][0]["http"]["paths"]]
check("V-D27 ingress paths match the service mounts",
      "/api/patients" in paths and "/api/symptom-checker" in paths, ", ".join(paths))

print()
for label, ok, detail in results:
    print("%s  %s" % ("PASS" if ok else "FAIL", label))
    if detail:
        print("       %s" % detail[:160])
print()
print("passed %d of %d" % (sum(1 for _, ok, _ in results if ok), len(results)))
