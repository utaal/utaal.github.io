---
layout: post
author: Andrea Lattuada
title: A hammer you can only hold by the handle
---

Today we're looking at the rust borrow checker from a different perspective.

{% highlight rust linenos %}
fn use_name(name: String) { }

fn main() {
    let name = String::from("Andrea");
    use_name(name);

    println!("{}", name);
}
{% endhighlight %}

Compiler output:

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

Using drop:

{% highlight rust linenos %}
fn main() {
  let a = get_number(); 

  if a > 3 {
    let data = vec![3, 4, 8];
  } // `data` dropped here

  println!("{}", data);
}
{% endhighlight %}

## Managing resources

{% highlight rust linenos %}
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
    pub fn wrap(&mut self, letter: Letter) {
        self.letter = Some(letter);
    }
}

impl PickupLorryHandle {
    pub fn pickup(&mut self, envelope: &Envelope) {
        /* give letter */
    }
    pub fn done(&mut self) {
        self.done = true; println!("sent");
    }
}
{% endhighlight %}

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

## 1, 2, 3

## Use once

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

{% highlight rust linenos %}
fn main() {
    let rustfest_letter = Letter::new(String::from("Dear RustFest"));
    let mut envelopes = vec![
        buy_prestamped_envelope(), buy_prestamped_envelope()];
    let mut lorry = order_pickup();
    for e in envelopes.iter_mut() {
        e.wrap(rustfest_letter);
        lorry.pickup(&e);
    }
    lorry.done();
}
{% endhighlight %}

<pre class="highlight">
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error[E0382]</span><span style="font-weight:bold;">: use of moved value: `rustfest_letter`</span>
  <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">--&gt; </span>letter1.rs:47:16
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">47</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>        e.wrap(rustfest_letter);
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">| </span>               <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">^^^^^^^^^^^^^^^</span> <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">value moved here in previous iteration of loop</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">|</span>
   <span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">= </span><span style="font-weight:bold;">note</span>: move occurs because `rustfest_letter` has type `Letter`, which does not implement the `Copy` trait

<span style="font-weight:bold;"></span><span style="color:blue;font-weight:bold;text-decoration:blink;">error</span><span style="font-weight:bold;">: aborting due to previous error</span>

<span style="font-weight:bold;">For more information about this error, try `rustc --explain E0382`.</span>
</pre>

## Enforce order

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



{% highlight rust linenos %}
{% endhighlight %}
