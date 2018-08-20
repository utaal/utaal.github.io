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

Now we'd like to make sure that the steps of the protocol are carried out in the proper order: we must not forget to put the letter in the envelope before handing it to the lorry driver!

{: #figure-reuse-envelope }
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
#figure-reuse-envelope pre span:nth-child(n+52):nth-child(-n+65) {
  color: #aaa;
  font-weight: regular;
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

Assert!

<pre class="highlight">
thread 'main' panicked at 'assertion failed: self.letter.is_none()'
note: Run with `RUST_BACKTRACE=1` for a backtrace.
</pre>

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

{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));

    let envelope = buy_prestamped_envelope();
    envelope.wrap(rustfest_letter);

    let eth_letter = Letter::new(String::from("Dear ETH"));
    envelope.wrap(eth_letter);

    let mut lorry = order_pickup();
    lorry.pickup(envelope);
    lorry.done();
}
{% endhighlight %}

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0308]</span><span style="font-weight:bold;">: mismatched types</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter2.rs:66:18
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">66</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    lorry.pickup(envelope);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                 <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">expected struct `ClosedEnvelope`, found struct `EmptyEnvelope`</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: expected type `<span style="font-weight:bold;">ClosedEnvelope</span>`
              found type `<span style="font-weight:bold;">EmptyEnvelope</span>`

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0308`.</span>
</pre>

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
#figure-no-reuse-envelope pre span:nth-child(n+52):nth-child(-n+65) {
  color: #aaa;
  font-weight: regular;
}
</style>

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0382]</span><span style="font-weight:bold;">: use of moved value: `envelope`</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter2.rs:51:27
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">48</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    let closed_envelope = envelope.wrap(rustfest_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                          <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--------</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value moved here</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">...</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">51</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>    let closed_envelope = envelope.wrap(eth_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>                          <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value used here after move</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: move occurs because `envelope` has type `EmptyEnvelope`, which does not implement the `Copy` trait

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0382`.</span>
</pre>

## Ensure a resource is released

![lorry question]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/lorry-questionmark.svg %}) 

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

<style type="text/css">
#figure-ensure-drop pre span:nth-child(n+42):nth-child(-n+42) {
  display: inline-block;
  background: rgba(150,150,250,0.5);
  color: #666;
  padding: 4px 8px 4px 4px;
}
</style>

## Limitations

Correct order: Large number of states ⇢many structs

## Example: http response

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

impl Drop for HttpResponseWritingBody { /* ... */ }
{% endhighlight %}

## Example: streaming engine
![lorry-time]({{ site.baseurl }}{% link assets/posts/a-hammer-you-can-only-hold-by-the-handle/lorry-time.svg %}) 

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

pub fn session(&mut self, cap: &Capability<T>) -> Handle
{% endhighlight %}
