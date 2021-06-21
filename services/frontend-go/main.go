package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, `<!doctype html> 
<html lang=en> 
<head> 
<meta charset=utf-8> 
<title>Groovy Console</title> 
</head> 
<body> 
<form action="run" method="post" enctype="multipart/form-data"> 	
<textarea type="text" id="script" name="script" rows="20" cols="80"> int timestamp = new Date().getTime() / 1000 println timestamp 	
</textarea> 	
<select name="version"> 	
<option value="3.0.5-jdk8">3.0.5-jdk8</option> 	
<option value="3.0.5-jdk11">3.0.5-jdk11</option> 	
<option value="2.5.7-jdk8">2.5.7-jdk8</option> 	
</select> 	
<input type="submit" value="Run"></input> 
</form> 
</body> 
</html>`)
	})
	http.HandleFunc("/run", func(w http.ResponseWriter, r *http.Request) {
		script := r.FormValue("script")
		version := r.FormValue("version")
		image := "groovy-runner:" + version
		dockerfile := `FROM groovy:` + version +
			` RUN echo -e '#!/usr/bin/env bash\ncat - >/tmp/script.groovy\ngroovy /tmp/script.groovy\n' > run.sh RUN chmod +x run.sh 
ENTRYPOINT /home/groovy/run.sh `
		cmdBuild := exec.Command("docker", "-H", "tcp://10.132.0.2:2375", "build", "-t", image, "-")
		cmdBuild.Stdin = strings.NewReader(dockerfile)
		out, err := cmdBuild.Output()
		if err != nil {
			fmt.Fprintf(w, "Err, %s %v", out, err)
			return
		}
		cmdRun := exec.Command("docker", "-H", "tcp://10.132.0.2:2375", "run", "--rm", "-i", "--cpus=1", image)
		cmdRun.Stdin = strings.NewReader(script)
		out, err = cmdRun.Output()
		if err != nil {
			fmt.Fprintf(w, "Err, %s %v", out, err)
		} else {
			w.Write(out)
		}
	})
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
