---
layout: post
author: Andrea Lattuada (<a href="https://twitter.com/utaal">@utaal</a>)
title: A hammer you can only hold by the handle
---

Today we're looking at the rust borrow checker from a different perspective. As you may know, the borrow checker is designed to safely handle memory allocation and ownership, preventing accessess to invalid memory and ensuring data-race freedom. This is a form of resource management: the borrow checker is tracking who's in charge of a chunk of memory, and who is currently allowed to read or write to it.

We'll see how this facilities can be used to enforce higher-level API constraints in your libraries and software: the same principles apply to memory management and other more abstract resources.

## Affine type systems

First, a refresher on [_affine types_](https://en.wikipedia.org/wiki/Substructural_type_system). Affine type systems, like Rust's, only allow a variable to be used once (if it's not a reference). This is at the core of the ownership semantics, and it's a significant departure from other mainstream languages (think of using a variable multiple times in C). Here's an example:

{% highlight rust linenos %}
fn use_name(name: String) { }

fn main() {
    let name = String::from("Andrea");
    use_name(name);

    println!("{}", name);
}
{% endhighlight %}

Note that `use_name` takes `name`'s ownership (and it's not pass-by-reference) so `name` is moved on line 5, and it cannot be used again on line 7. Here's the compiler output:

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0382]</span><span style="font-weight:bold;">: use of moved value: `name`</span>
 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>affine.rs:7:18
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">5</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>  use_name(name);
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>           <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">----</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value moved here</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">6</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">7</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>  println!(&quot;{}&quot;, name);
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value used here after move</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: move occurs because `name` has type `std::string::String`, which does not implement the `Copy` trait

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0382`.</span>
</pre>

If you'd like a more in-depth explanation on _ownership_ (Rust's lingo for its affine type system), you can take a look at the [relevant chapter](https://doc.rust-lang.org/book/second-edition/ch04-01-what-is-ownership.html) in the Rust book.

## Drop

Now we know what happens if we try to give up ownership of a variable more than once, but what if we never use it inside a scope?

First of all, Rust is lexically scoped, so variable names are only valid within the scope where they're defined.

{% highlight rust linenos %}
struct Thing {
    number: u32,
}

fn main() {
    let a = 4;

    if a > 3 {
        let thing = Thing { number: a };
    } // `thing` dropped here

    println!("{}", thing);
}
{% endhighlight %}

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0425]</span><span style="font-weight:bold;">: cannot find value `thing` in this scope</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>drop.rs:12:18
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">12</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>  println!(&quot;{}&quot;, thing);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">not found in this scope</span>

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0425`.</span>
</pre>

No `thing` there, it went out of scope on line 10. Importantly, `thing` goes out of scope before its ownership was transfered, so Rust _drops_ it: the compiler inserts code to clean up all resources associated with `thing` and frees its memory. We can hook into this mechanism by providing an implementation of the special `Drop` trait:

{% highlight rust linenos %}
impl Drop for Thing {
    fn drop(&mut self) {
        eprintln!("dropping thing {}", self.number);
    }
}

fn main() {
    let a = 4;

    if a > 3 {
        let thing = Thing { number: a };
        eprintln!("inside scope");
    } // `thing` dropped here
    eprintln!("outside scope");
}
{% endhighlight %}

If we run this we get:

<pre class="highlight">
inside scope
dropping thing 4
outside scope
</pre>

Again, more details are in [the book](https://doc.rust-lang.org/book/second-edition/ch15-03-drop.html).

## Managing resources

We're going to try to encode higher level API constraints using the _linear typing_ (_ownership_) semantics of Rust.

![envelope, letter, lorry]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/envelope-letter-lorry.svg %})

The interaction we're going to describe is pretty simple: sending a letter via a delivery service. One has a written letter they'd like to send: they put it in a pre-stamped envelope, they close the envelope and they hand it to the lorry driver. Of course, all of this applies to many APIs: we'll see a couple of examples at the end.

Here's a way to model our protocol in Rust:

{% highlight rust linenos %}
#[derive(Clone)]
pub struct Letter {
    text: String,
}

pub struct Envelope {
    letter: Option<Letter>,
}

pub struct PickupLorryHandle {
    done: bool,
    // references to lorry's resources
}

impl Letter {
    pub fn new(text: String) -> Self { Letter { text: text } }
}

impl Envelope {
    /// Put a letter in the envelope and seal it.
    pub fn wrap(&mut self, letter: &Letter) {
        self.letter = Some(letter.clone());
    }
}

impl PickupLorryHandle {
    /// Give an envelope to the delivery driver.
    pub fn pickup(&mut self, envelope: &Envelope) {
        // (the details here don't matter)
    }

    /// Tell the driver we don't have anything else for them.
    pub fn done(&mut self) {
        self.done = true; println!("sent");
    }
}
{% endhighlight %}

With this in place we can write our client code:

{% highlight rust linenos %}
// in a separate module
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut rustfest_envelope = buy_prestamped_envelope();
    rustfest_envelope.wrap(&rustfest_letter);
    let mut lorry = order_pickup();
    lorry.pickup(&rustfest_envelope);
    lorry.done();
}
{% endhighlight %}

Our client code:
* writes a new letter (line 3),
* buys a prestamped envelope (line 4),
* puts the letter in the envelope and seals it (line 5),
* orders a pickup from the delivery company (line 6),
* hands the closed envelope to the driver (line 7),
* tells the driver we don't have anything else for them (line 8).

## 1, 2, 3

Our API has three shortcomings we can better address with Rust's type system:

1. we'd like to prevent re-use of what we know it's a finite resource: we only have one physical copy of the letter;<br/>
![letter duplicate]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/letter-duplicate.svg %}) 

2. we want to make sure that we perform a series of steps in the right order (and only once): put the letter in the envelope, seal it, and give it to the driver (i.e. avoid giving an empty envelope);<br/>
![letter, envelope, lorry]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/envelope-order.svg %}) 

3. we don't want to forget to release a resouce when we're done: we ensure we tell the driver they can leave.<br/>
![lorry question]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/lorry-questionmark.svg %}) 

## Use a resource only once
![letter duplicate]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/letter-duplicate.svg %}) 

Here's some problematic client code:

{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut envelopes = vec![
        buy_prestamped_envelope(), buy_prestamped_envelope()];
    let mut lorry = order_pickup();
    for e in envelopes.iter_mut() {
        e.wrap(&rustfest_letter);
        lorry.pickup(&e);
    }
    lorry.done();
}
{% endhighlight %}

No compiler error, but somehow the letter was magically duplicated and inserted in both envelopes. Sometimes, this is perfectly fine (copying some memory isn't a big deal), but sometimes the resource represented by our `struct` cannot be easily duplicated: in this example, if it's representing a constraint in our business logic. In general, if our `struct` represents an handle to a resource out of our control, we may not be able to `clone` it without breaking some safety or correctness guarantees.

So let's remove the `Clone` implementation for `Letter`, and adjust the client code:

{: #figure-nonclone-letter }
{% highlight rust linenos %}
{{a}}#[derive(Clone)]
pub struct Letter {
    text: String,
}

impl Envelope {
    pub fn wrap(&mut self, letter: Letter) { // take ownership of `letter`
        self.letter = Some(letter);
    }
}
{% endhighlight %}

{: #figure-nonclone-letter-main }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut envelopes = vec![
        buy_prestamped_envelope(), buy_prestamped_envelope()];
    let mut lorry = order_pickup();
    for e in envelopes.iter_mut() {
        e.wrap(rustfest_letter); // give ownership of `rustfest_letter`
        lorry.pickup(&e);
    }
    lorry.done();
}
{% endhighlight %}

<style type="text/css">
#figure-nonclone-letter pre span:nth-child(-n+6) {
  background: rgba(255,230,0,0.5);
  text-decoration: line-through;
}

#figure-nonclone-letter pre span:nth-child(n+29):nth-child(-n+29) {
  background: rgba(255,230,0,0.5);
}

#figure-nonclone-letter-main pre span:nth-child(n+44):nth-child(-n+44) {
  background: rgba(255,230,0,0.5);
}

#figure-nonclone-letter-main pre span:nth-child(-n+33) {
  color: #aaa;
  font-weight: regular;
}

#figure-nonclone-letter-main pre span:nth-child(n+54) {
  color: #aaa;
  font-weight: regular;
}
</style>

Here's the compiler output:

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0382]</span><span style="font-weight:bold;">: use of moved value: `rustfest_letter`</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter1.rs:7:16
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;"> 7</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>        e.wrap(rustfest_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>               <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value moved here in previous iteration of loop</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: move occurs because `rustfest_letter` has type `Letter`, which does not implement the `Copy` trait

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0382`.</span>
</pre>

Great! We can now only use each letter once!

## Enforce order
![letter duplicate]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/envelope-order.svg %}) 

Now we'd like to make sure that the steps of the protocol are carried out in the proper order: we must not forget to put the letter in the envelope before handing it to the lorry driver! And, can we prevent inserting two letters in the same envelope at compile time?

Here's broken client code:

{: #figure-reuse-envelope }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut first_envelope = buy_prestamped_envelope();
    first_envelope.wrap(rustfest_letter);

    let eth_letter = Letter::new(String::from("Dear ETH"));
    first_envelope.wrap(eth_letter);

    let mut lorry = order_pickup();
    lorry.pickup(&first_envelope);

    let another_envelope = buy_prestamped_envelope();
    lorry.pickup(&another_envelope);

    lorry.done();
}
{% endhighlight %}

<style type="text/css">
#figure-reuse-envelope pre span:nth-child(n+24):nth-child(-n+24),
#figure-reuse-envelope pre span:nth-child(n+42):nth-child(-n+42),
#figure-reuse-envelope pre span:nth-child(n+68):nth-child(-n+68) {
  background: rgba(150,150,250,0.5);
}
</style>

{: #figure-letter-assert }
{% highlight rust linenos %}
impl Envelope {
    pub fn wrap(&mut self, letter: &Letter) {
        assert!(self.letter.is_none());
        self.letter = Some(letter.clone());
    }
}
{% endhighlight %}

<style type="text/css">
#figure-letter-assert pre span:nth-child(n+18):nth-child(-n+24) {
  background: rgba(255,230,0,0.5);
}
</style>

This compiles, but of course the assert in `wrap` will fire, at runtime.

<pre class="highlight">
thread 'main' panicked at 'assertion failed: self.letter.is_none()'
note: Run with `RUST_BACKTRACE=1` for a backtrace.
</pre>

We'd like to prevent this at compile time. And once that's fixed, what about making sure we don't send empty envelopes (`another_envelope` on lines 12-13 of `main`)?

We can make a copule classes to represent in which state the `Envelope` is in: `EmptyEnvelope` is an empty pre-stampted envelope, and `ClosedEnvelope` is a closed envelope guaranteed to contain a letter. We can then only provide implementations for actions that make sense for that specific state. Then, to make sure we don't send an empty envelope, we make sure that `pickup` only takes a `ClosedEnvelope` (and we make it take ownership, to avoid spurious copies).

{: #figure-order-structs }
{% highlight rust linenos %}
/// An empty pre-stamped envelope.
pub struct EmptyEnvelope { }

/// A closed envelope containing a letter.
pub struct ClosedEnvelope {
    letter: Letter,
}

impl EmptyEnvelope {
    /// Put a letter in the envelope and seal it.
    pub fn wrap(self, letter: Letter) -> ClosedEnvelope {
        ClosedEnvelope { letter: letter }
    }
}

impl PickupLorryHandle {
    /// Give an envelope to the delivery driver.
    pub fn pickup(&mut self, envelope: ClosedEnvelope) {
        /* give letter */
    }

    ...
}

pub fn buy_prestamped_envelope() -> EmptyEnvelope { EmptyEnvelope { } }
{% endhighlight %}

<style type="text/css">
#figure-order-structs pre span:nth-child(n+56):nth-child(-n+56) {
  background: rgba(255,230,0,0.5);
}
</style>

And here's the updated client code:

{: #figure-no-send-empty }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut first_envelope = buy_prestamped_envelope();
    first_envelope.wrap(rustfest_letter);

    let eth_letter = Letter::new(String::from("Dear ETH"));
    first_envelope.wrap(eth_letter);

    let mut lorry = order_pickup();
    lorry.pickup(first_envelope);

    let another_envelope = buy_prestamped_envelope();
    lorry.pickup(another_envelope);

    lorry.done();
}
{% endhighlight %}

<style type="text/css">
#figure-no-send-empty pre span:nth-child(n+56):nth-child(-n+56),
#figure-no-send-empty pre span:nth-child(n+66):nth-child(-n+66) {
  background: rgba(255,230,0,0.5);
}
#figure-no-send-empty pre span:nth-child(n+5):nth-child(-n+46),
#figure-no-send-empty pre span:nth-child(n+68):nth-child(-n+70) {
  color: #aaa;
  font-weight: regular;
}
</style>

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0308]</span><span style="font-weight:bold;">: mismatched types</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter2.rs:10:18
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">10</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    lorry.pickup(first_envelope);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">expected struct `ClosedEnvelope`, found struct `EmptyEnvelope`</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: expected type `<span style="font-weight:bold;">ClosedEnvelope</span>`
              found type `<span style="font-weight:bold;">EmptyEnvelope</span>`

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0308]</span><span style="font-weight:bold;">: mismatched types</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter2.rs:13:18
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">13</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    lorry.pickup(another_envelope);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">expected struct `ClosedEnvelope`, found struct `EmptyEnvelope`</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: expected type `<span style="font-weight:bold;">ClosedEnvelope</span>`
              found type `<span style="font-weight:bold;">EmptyEnvelope</span>`

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to 2 previous errors</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0308`.</span>
</pre>

One problem prevented: no empty envelopes can be sent! Note how the compiler errors point us towards a solution: we need a `ClosedEnvelope` for the `lorry` to `pickup`. Let's fix the client code again.

{: #figure-no-reuse-envelope }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));

    let envelope = buy_prestamped_envelope();
    let closed_envelope = envelope.wrap(rustfest_letter);

    let eth_letter = Letter::new(String::from("Dear ETH"));
    let closed_envelope = envelope.wrap(eth_letter);

    let mut lorry = order_pickup();
    lorry.pickup(closed_envelope);
    lorry.done();
}
{% endhighlight %}

<style type="text/css">
#figure-no-reuse-envelope pre span:nth-child(n+24):nth-child(-n+24),
#figure-no-reuse-envelope pre span:nth-child(n+45):nth-child(-n+45) {
  background: rgba(150,150,250,0.5);
}
#figure-no-reuse-envelope pre span:nth-child(n+63):nth-child(-n+65) {
  color: #aaa;
  font-weight: regular;
}
</style>

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0382]</span><span style="font-weight:bold;">: use of moved value: `envelope`</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter2.rs:8:27
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;"> 5</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    let closed_envelope = envelope.wrap(rustfest_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                          <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--------</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value moved here</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">...</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;"> 8</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    let closed_envelope = envelope.wrap(eth_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                          <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value used here after move</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: move occurs because `envelope` has type `EmptyEnvelope`, which does not implement the `Copy` trait

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0382`.</span>
</pre>

By making `EmptyEnvelope` take `self`'s ownership we can use the _linear typing_ technique from earlier to prevent reuse of `envelope`: once we've put a letter in an envelope, we get back a `ClosedEnvelope`, that can only be handed over to the `lorry` driver. Now the compiler can help us make sure we follow the protocol steps in order: put the letter in the envelope, then send it.

We'll see a more complex example in which we compose an http response in the right order using this technique. For now, here's the correct client code with the new API:

{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut envelope = buy_prestamped_envelope();
    let closed_envelope = envelope.wrap(rustfest_letter);

    let mut lorry = order_pickup();
    lorry.pickup(closed_envelope);
    lorry.done();
}
{% endhighlight %}

## Ensure a resource is released

![lorry question]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/lorry-questionmark.svg %}) 

Another common mistake: forgetting to release a resource. In the following client code, `lorry.done()` is missing, and we never tell the delivery driver we're done. And, in this tortured methaphor, we'd never deliver the letter because the driver never leaves...

{: #figure-missing-done }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut envelope = buy_prestamped_envelope();
    let closed_envelope = envelope.wrap(rustfest_letter);

    let mut lorry = order_pickup();
    lorry.pickup(closed_envelope);
}
{% endhighlight %}

In the real world, we may keeping a connection open, or never completing a process in our business logic; and it's just because we forgot a single line.

We've seen that we can hook into Rust's _drop_ mechanism; here's how we'd ensure that we release the `lorry`:

{% highlight rust linenos %}
impl Drop for PickupLorryHandle {
    fn drop(&mut self) {
        if !self.done {
            self.done();
        }
    }
}

impl PickupLorryHandle {
    /// Tell the driver we don't have anything else for them.
    pub fn done(self) {
        self.done = true; println!("sent");
    }

    ...
}
{% endhighlight %}

{: #figure-ensure-drop }
{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));

    let envelope = buy_prestamped_envelope();
    let closed_envelope = envelope.wrap(rustfest_letter);

    let mut lorry = order_pickup();
    lorry.pickup(closed_envelope);

    // `lorry` dropped here
}
{% endhighlight %}

Now when the lorry goes out of scope the `drop` implementation is called, and we automatically send the driver on their merry way.

## In the `std` library

This last pattern is often used in the `std` library when building abstractions where there's a need to release a resource or an handle to a resource.

`Rc`, "a single-threaded reference-counting pointer", tracks the number of references to a resource, and the ownership of the `Rc` pointer represents a strong reference: when no references are left (all `Rc`s are dropped), the underlying resource (memory and other elements of the `struct`) should be freed.

There's some `unsafe` trickery under the hood, but what's relevant here is that `Rc` uses `Drop` to release the underlying memory once the reference-count reaches zero.

Here's the relevant code: [https://doc.rust-lang.org/src/alloc/rc.rs.html#802-847](`std::rc::Rc`).

{% highlight rust %}
unsafe impl<#[may_dangle] T: ?Sized> Drop for Rc<T> {
    // ...
    fn drop(&mut self) {
        unsafe {
            self.dec_strong();
            if self.strong() == 0 {
                // destroy the contained object
                ptr::drop_in_place(self.ptr.as_mut());
                // ...
            }
        }
    }
}
{% endhighlight %}

Locking a `Mutex`, "a mutual exclusion primitive useful for protecting shared data", returns a `MutexGuard`, "an RAII implementation of a scoped lock of a mutex", that is, an object that represents the fact that we're holding the lock. And `Drop` is used so we can release the lock just by `drop`ping the guard (either explicitly, with [`std::mem::drop`](https://doc.rust-lang.org/std/mem/fn.drop.html), or when it goes out of scope).

This is the signature of `Mutex::lock`:

`pub fn lock(&self) -> LockResult<MutexGuard<T>>`

And here's the `Drop` implementation for `MutexGuard`:
[https://doc.rust-lang.org/src/std/sync/mutex.rs.html#452-460](`std::sync::MutexGuard`).

{% highlight rust %}
#[stable(feature = "rust1", since = "1.0.0")]
impl<'a, T: ?Sized> Drop for MutexGuard<'a, T> {
    #[inline]
    fn drop(&mut self) {
        unsafe {
            self.__lock.poison.done(&self.__poison);
            self.__lock.inner.raw_unlock();
        }
    }
}
{% endhighlight %}

<style type="text/css">
#figure-ensure-drop pre span:nth-child(n+42):nth-child(-n+42) {
  display: inline-block;
  background: rgba(150,150,250,0.5);
  color: #666;
  padding: 4px 8px 4px 4px;
}
</style>


## Example: http response

Now let's look at an example of how all of these techniques can be combined in a realistic API. Let's say we're building an http server library, and we want to make sure that when we write our response we first send all the headers, and only then start writing the body. We may also want to make sure not to forget to flush the buffer at the end. 

We use two structs to represent the two states: `HttpResponseWritingHeader`, and `HttpResponseWritingBody`. The method `body` on `HttpResponseWritingHeader` takes ownership of `self`, ensuring that the header writer can no longer be used after this call (its ownership is transfered), and only body chunks can be appended to the response. 

{% highlight rust linenos %}
pub struct HttpResponseWritingHeaders { /* connection, … */ }

pub struct HttpResponseWritingBody { /* ... */ }

pub fn start_response() -> HttpResponseWritingHeaders { /* ... */ }

impl HttpResponseWritingHeaders {
    fn header(&mut self, header: Header) { /* ... */ }

    fn body(self) -> HttpResponseWritingBody { /* ... */ }
}

impl HttpResponseWritingBody {
    fn write(&mut self, chunk: Chunk) { /* ... */ }

    fn cease(self) { }
}

impl Drop for HttpResponseWritingBody {
    fn drop(&mut self) {
        self.flush();
    }
}
{% endhighlight %}

The `Drop` implementation ensures that a completed response is always fully written out to the client.

## State explosion

Note that the technique of representing the state of a protocol/object with many structs has a significant drawback when the possible state space grows large: we may end up juggling a lot of structs, and the benefit of compile time checks may not be worth the cost in lines-of-code, and maintainability.

## Example: streaming engine

This last example is a short appetiser for a future blog post. At the [Systems Group](https://www.systems.ethz.ch) of the [ETH Zürich CS department](https://www.inf.ethz.ch), we're working on [timely dataflow](https://github.com/frankmcsherry/timely-dataflow), a low-latency cyclic dataflow computational model: it lets you describe computations as a cyclic graph of nodes (operators), that perform some transformation on incoming data and maintain local state, and edges (channels) that carry data between operators. A computation built this way can be automatically parallelised across cores and computers, over the network.

In timely dataflow, data is transported on channels as tuples, each carrying a logical timestamp.

![lorry-time]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/lorry-time.svg %}) 

Timestamps are used to represent logical boundaries between groups of tuples so that operations can be performed on some subset, and timely dataflow tracks which timestamps are in flight in the system. Importantly, for timely dataflow's correctness, operators are only allowed to send messages with timestamp `t` when they hold a `Capability` for the same timestamp `t`. In addition, they need to report whenever they relinquish one of these capabilities, so that the system can make forward progress.

In timely, we use something like the following to represent a `Capability` a resource which grants permission to send data at a certain timestamp.

{% highlight rust linenos %}
/// The capability to send data with a certain timestamp on a dataflow edge.
pub struct Capability<T: Timestamp> {
    time: T,
    internal: Rc<RefCell<ChangeBatch<T>>>,
}

impl<T: Timestamp> Clone for Capability<T> {
    fn clone(&self) -> Capability<T> {
        // … update self.internal …
    }
}

impl<T: Timestamp> Drop for Capability<T> {
    fn drop(&mut self) {
        // … update self.internal …
    }
}

/// Return a channel handle to send data at the timestamp carried by `cap`.
pub fn session(&mut self, cap: &Capability<T>) -> Handle
{% endhighlight %}

`Capability` has a custom `Clone` implementation, that keeps track of how many copies we've made (a bit like `Rc`), and a `Drop` implementation, so we can be sure that a `Capability` is dropped if not explicitly retained. The function that an operator uses to write to its output requires a reference to a valid `Capabliity` for a certain timestamp: this way we enforce, at compile time, one of the protocol constraints of timely dataflow.

In the next post we'll take a deeper look at the systems aspects of capabilities in timely.
