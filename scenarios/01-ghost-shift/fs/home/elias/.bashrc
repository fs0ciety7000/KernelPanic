# ~/.bashrc: executed by bash(1) for non-login shells.
case $- in *i*) ;; *) return;; esac

HISTCONTROL=ignoreboth
HISTSIZE=1000
HISTFILESIZE=2000
shopt -s histappend

PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[36m\]\w\[\e[0m\]\$ '

alias ll='ls -alF'
alias la='ls -A'
alias jobsot='lumenctl jobs'

export EDITOR=nano
