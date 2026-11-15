import re
t=open("src/template.html").read()
t=t.replace("/*CSS*/",open("src/style.css").read())
eng=open("src/engine.js").read().replace("if (typeof module !== 'undefined') module.exports = FT;","")
t=t.replace("/*ENGINE*/",eng).replace("/*APP*/",open("src/app.js").read())
open("index.html","w").write(t)
print(len(t)//1024,"KB")
