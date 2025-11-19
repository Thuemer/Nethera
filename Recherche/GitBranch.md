# 🧬 GIT Zweige (Branches)

---

## Was ist ein Zweig (Branch)?

> Ein Zweig ist **kein** separater Ordner, sondern ein **leichtgewichtiger Verweis** auf einen bestimmten Commit.

Man kann sich einen Zweig wie eine **Zeitleiste** vorstellen:  
Wenn man einen neuen Zweig erstellt, ist es, als ob man sagt:  
„Lass uns von hier aus einen neuen Weg erkunden.“

Alles, was du in diesem Zweig machst, wirkt sich nicht direkt auf den Haupt-Zweig (z. B. `main` oder `master`) aus, bis du ihn zurückmischst.

Technisch gesehen ist ein Branch in Git schlicht eine **Referenz (Pointer)** auf ein Commit-Objekt.  
Zum Beispiel: `.git/refs/heads/feature-xyz` verweist auf eine Commit-ID.  
Wenn du neue Commits machst, verschiebt sich dieser Pointer weiter.  
*(Quelle: [Atlassian](https://www.atlassian.com/git/tutorials/using-branches), [Wikipedia](https://en.wikipedia.org/wiki/Git))*  

---

## Warum nutzt man Branches?

Branches ermöglichen **paralleles Arbeiten**, ohne den stabilen Code zu gefährden.

Ein paar typische Gründe:

- Neue Features entwickeln, ohne den Haupt-Code zu stören  
- Fehlerbehebung oder Experimentieren, ohne Risiko  
- Unterschiedliche Versionen oder Releases verwalten  

*(Quellen: [Atlassian](https://www.atlassian.com/git/tutorials/using-branches), [W3Schools](https://www.w3schools.com/git/git_branch.asp), [Medium](https://medium.com/@jacoblogan98/understanding-git-branching-5d01f3dda541))*  

---

## Wie arbeitet man mit Branches (Grundbefehle)

| Zweck | Befehl | Wirkung |
|:------|:--------|:--------|
| Alle Zweige anzeigen | `git branch` | Listet alle lokalen Branches |
| Neuen Zweig erstellen | `git branch <name>` | Legt den Zweig an, wechselt aber nicht automatisch dorthin |
| Zu einem Zweig wechseln | `git checkout <name>` oder `git switch <name>` | Wechselt den Arbeitskontext |
| Neuer Zweig + Wechsel | `git checkout -b <name>` | Spart einen Schritt |
| Zweig löschen (wenn gemerged) | `git branch -d <name>` | Löscht den Zweig sicher |
| Zweig erzwingen löschen | `git branch -D <name>` | Löscht auch bei ungemergten Änderungen (vorsicht!) |

Zusatz:  
Um **Remote-Branches** zu löschen:
```bash
git push origin --delete <branch>
```

*(Quelle: [Atlassian](https://www.atlassian.com/git/tutorials/using-branches), [W3Schools](https://www.w3schools.com/git/git_branch.asp))*  

---

## Branching & Merging – Wie passt das zusammen?

Der spannende Teil:  
Du entwickelst auf einem Zweig, willst aber irgendwann deine Änderungen zurück in den Hauptzweig bringen.

1. Neuen Feature-Zweig erstellen  
   ```bash
   git checkout -b feature/xyz
   ```

2. Änderungen machen, committen  

3. Wenn fertig, zum Hauptzweig zurück  
   ```bash
   git checkout main
   ```

4. Zusammenführen (Merge)  
   ```bash
   git merge feature/xyz
   ```

5. Optional löschen  
   ```bash
   git branch -d feature/xyz
   ```

*(Quelle: [Git-Book](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging))*  

---

## Branching-Strategien (Workflows)

Nicht jedes Projekt nutzt dieselbe Struktur.  
Hier einige gängige Varianten:

- **Feature Branch Workflow**  
  Jede neue Funktion bekommt ihren eigenen Branch.  
  Wird getestet (z. B. via Pull Request) und dann in `main` gemerged.

- **Release Branching**  
  Branches, die eine kommende Version stabilisieren (z. B. `release/v1.2`).

- **Trunk-Based Development**  
  Wenige Branches, viel direkt auf `main`.  
  Ideal bei kleinen, häufigen Änderungen.

*(Quelle: [Atlassian](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow), [Medium](https://medium.com/@jacoblogan98/understanding-git-branching-5d01f3dda541))*  

---

## Wichtige Aspekte & Fallen

- Branches sind **leichtgewichtig** – kein Kopieren des gesamten Projekts  
- **Regelmäßiges Synchronisieren** verhindert Merge-Konflikte  
- Ein gelöschter Branch verliert seinen Namen, aber der Verlauf bleibt  
- Gute Branch-Namen helfen: `feature/login`, `bugfix/crash-500`, etc.

*(Quelle: [Atlassian](https://www.atlassian.com/git/tutorials/using-branches), [StackOverflow](https://stackoverflow.com/questions/10009175/how-to-properly-use-git-and-branches))*  

---

## Praktisches Beispiel

> Du bist auf `main` und willst die neue Funktion „Benutzerregistrierung“ bauen.

```bash
# 1. Neuen Branch erstellen
git checkout -b feature/benutzerregistrierung
  
# 2. Arbeiten, Commits machen
git add .
git commit -m "Feature: Benutzerregistrierung hinzugefügt"
  
# 3. Änderungen aus main holen (aktualisieren)
git fetch origin
git merge origin/main
  
# 4. Wenn fertig:
git checkout main
git merge feature/benutzerregistrierung
  
# 5. Pushen
git push origin main
  
# 6. Branch löschen (optional)
git branch -d feature/benutzerregistrierung
```

Damit bleibt `main` stabil, während du experimentierst.

---

## Quellen

- [DataCamp: Git Branch Tutorial](https://www.datacamp.com/de/tutorial/git-branch)  
- [Atlassian: Using Branches](https://www.atlassian.com/git/tutorials/using-branches)  
- [Git SCM Book](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)  
- [W3Schools: Git Branch](https://www.w3schools.com/git/git_branch.asp)  
- [FreeCodeCamp: Git Branching Explained](https://www.freecodecamp.org/news/git-branching-commands-explained/)  
- [Medium: Understanding Git Branching](https://medium.com/@jacoblogan98/understanding-git-branching-5d01f3dda541)

---

Author: Moritz Kapeller