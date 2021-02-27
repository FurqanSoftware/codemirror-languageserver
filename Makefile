all: index.js

clean:
	rm -rf index.js

index.js: index.coffee
	./node_modules/.bin/coffee -c -t $^

test: index.js test.coffee
	./node_modules/.bin/mocha -u bdd -R spec -t 10000 -s 5000 --require coffeescript/register test.coffee
