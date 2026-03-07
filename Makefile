.PHONY: build install clean

PREFIX ?= $(HOME)/bin

build:
	swift build -c release

install: build
	mkdir -p $(PREFIX)
	cp .build/release/greentap $(PREFIX)/greentap

clean:
	swift package clean
