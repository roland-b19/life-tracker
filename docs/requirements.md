# Course requirements

Source: pasted by the user from the Azure course description (2026-11-02). Original text kept verbatim in Romanian at the bottom; the checklist is the working version. Update the status column as work progresses.

## Checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | At least one **compute** resource on Azure | open |
| 2 | At least one **database or object storage** | open |
| 3 | App is **secured**: e.g. the database is not exposed to the internet | open |
| 4 | **Authentication and authorization** (mandatory) | open |
| 5 | Ideally a **message queue** (inter-service communication or email notifications) | open |
| 6 | Real functionality: not "Hello World", not rocket science | open |
| 7 | Deployments are **scripted** (az CLI / ARM templates / Terraform; tool to be discussed in later lectures and labs) | open |
| 8 | Backend and database in the cloud, secured (a mobile client is allowed, but it is not required) | open |

Notes from the course:
- Older projects or projects from other courses may be reused, adapted to run in the cloud.
- Do not keep resources running until January, the credit will run out. Per iteration: deploy with the script, work, delete everything. Redeploy on the next iteration.
- Worst case, if the credit runs out: [Azure Free Account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account).

## Original text (Romanian)

> Pentru proiect:
>
> * Trebuie sa folositi principalele servicii azure -- cel putin o resursa compute, cel putin o baza de date / object storage, aplicatia trebuie sa fie securizata (de exemplu nu trebuie sa va expuneti baza de date in internet), trebuie sa aveti autentificare si autorizare; ideal si o coada de mesaje (de exemplu pt comunicare intre microservicii sau pt email notifications)
> * Puteti folosi proiecte mai vechi / de la alte cursuri. Vor trebui adaptate sa ruleze in cloud.
> * Puteti folosi si aplicatii mobile daca aveti, cu conditia sa aiba backendul / baza de date in cloud si sa fie securizate
> * Codul nu trebuie sa fie rocket science, dar nici Hello World. Trebuie sa aiba ceva functionalitati de baza, si neaparat autentificare / autorizare
> * Va trebui sa va scriptati deploymenturile (az cli commands / ARM templates / terraform -- to be discussed in later lectures / labs)
> * Ideal nu va tineti resursele pornite de cand va apucati pana in ianuarie pentru ca o sa va consumati creditul. Mod de lucru sugerat -- dupa ce ati terminat de lucrat la o iteratie, va stergeti toate resursele. La urmatoarea iteratie le redeployati cu scriptul cat lucrati, apoi le stergeti din nou.
> * Worst case in caz ca va terminati creditele -- [Azure Free Account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account)
