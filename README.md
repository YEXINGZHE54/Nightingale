Nightingale
===========

A js-based html template engine

It is a template engine, which support configurable flags and handlers. Here is a simple exapmle:
<script>
	var tpl = new Template("{str}");
	//if you don't like use { and } to quote, you can : tpl.configure({startl:"%",endl:"%"})
	tpl.compile();
	// or reset original string tpl.compile("%str%")
	var result = tpl.render({str:"hello world!"});
	//you can also: var str = "hello world!"; var result = tpl.render();
</script>

Further 
===========

It support following tags:

	if, expr, lo, while, debug, alias
	
and you can add your own handler, by:

	tpl.add_handler({flag:"yourflag", oncreate:function(){}, onrender:function(){}});
	
for more detail, please refer to the source code
