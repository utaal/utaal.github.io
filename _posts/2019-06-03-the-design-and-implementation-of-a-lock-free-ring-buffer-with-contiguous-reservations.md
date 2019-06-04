---
layout: post
author: Andrea Lattuada (<a href="https://twitter.com/utaal">@utaal</a>) and James Munns (<a href="https://twitter.com/bitshiftmask">@bitshiftmask</a>)
title: The design and implementation of a lock-free ring-buffer with contiguous reservations
excerpt: "This is the story of how <a href=\"https://twitter.com/bitshiftmask\">James Munns</a> and I designed and implemented (two versions!) of an high-perf lock-free ring-buffer for cross-thread communication. If any of those words look scary to you, don't fret, we'll explain everything from the basics."
---


This is the story of how [James Munns](https://twitter.com/bitshiftmask) and I designed and implemented (two versions!) of an high-perf lock-free ring-buffer for cross-thread communication. If any of those words look scary to you, don't fret, we'll explain everything from the basics.

<br/>

_This post is cross-posted on Ferrous Systems' [blog](https://ferrous-systems.com/blog/lock-free-ring-buffer/) and on the ETH Zürich [Systems Group blog](https://blog.systems.ethz.ch/blog/2019/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations.html)._

<br/>

This post is for you if you're interested in (safe!) concurrency, systems programming, and cool ways to write efficient systems software. If you've never written a thread-safe data structure, this post may be a great way to get started!

## Circular buffers

A [_BipBuffer_](https://www.codeproject.com/Articles/3479/The-Bip-Buffer-The-Circular-Buffer-with-a-Twist) is a bi-partite circular buffer that always supports writing a contiguous chunk of data, instead of potentially splitting a write in two chunks when it straddles the buffer's boundaries.

Circular buffers are a common primitive for asynchronous (inter- or intra- thread) communication. Let's start with a very abstract, idealised view of the circular buffer interface, and then consider real-world constraints one by one, till we get to the _BipBuffer_ design.

### An idealised infinite buffer

A writer (producer) and a reader (consumer) want to communicate, and have access to the same, contiguous, and infinite array. They both keep a bookmark of which part of the array they've (respectively) written and read. They start with these `write` and `read` pointers aligned.

When the writer wants to send data, it appends it after the `write` pointer and then moves the pointer to the end of the newly written chunk. The reader inspects the `write` pointer at its leisure (asynchronously). When the `write` pointer has advanced further than the `read` pointer, the reader can consume and act on the available data. Once that's done, it moves the `read` pointer forwards to keep track of which part of the buffer it has already processed.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/jncR6qd.png %})

The reader will never attempt to read past the `write` pointer, because there's no guarantee there's valid data there (i.e. that the writer has put anything there). This also means that the `read` pointer can never overtake `write`. For now, we're assuming an ideal memory system that's always coherent and where writes are visible immediately and sequentially.

### A bounded circular buffer

Computers don't have magic infinite buffers. We have to allocate a finite amount of memory to use for potentially infinite communication between the writer and reader. In a circular buffer, the `write` pointer can wrap around the boundaries of the buffer when it reaches the end.

When new data arrives and the `write` pointer is close to the end, it splits the write in two chunks: one for the remaining buffer space at the end, and one for the remaining data at the beginning. Note that, if the `read` pointer is still close to the beginning, this has the potential of clobbering data that hasn't yet been processed by the reader. For this reason, the `write` pointer is not allowed to overtake `read` after it has wrapped around.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/zfwNfD0.png %})

We end up with two possible memory configurations:

1. `write` leads and `read` follows (`write` ≥ `read`), the valid data (written, but not yet processed by the reader) is in the section of the buffer after `read` and before `write`;
2. `read` leads and `write` follows (`read` > `write`), the valid data is after `read`, till the end, and from the start of the buffer till `write`.

Note that we disallow `read` == `write` in the second case, as this would be ambiguous: while `read` can catch up to `write`, after a wraparound `write` has to stay one step behind `read` to indicate that we're in case 2 instead of case 1.

We repeatedly move from configuration 1 to 2, then back to 1: when `read` reaches the end of the buffer, it can also wrap around to continue reading at the start.

### Contiguous writes/reads

This is all great, but what if we have chunks of data that should remain contiguous in memory when written to the buffer? Look here, there's a new message to be written, but it doesn't fit in the remaining buffer space after `write`. 

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/szHSC8M.png %})

If, for whatever reason, we aren't allowed to split this write in two, we're stuck. Maybe we can just wait for `read` to move forwards, and place our new data in a single chunk at the start of the buffer? Well, in fact, yea. But there's a caveat.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/Lb8C3sq.png %})

We've broken the property in configuration 2 earlier: there's a section of the buffer that's between `read` and the end of the buffer, but doesn't contain any valid data. If we didn't do anything about it, the reader would keep consuming data, moving `read` forwards, and it would be oblivious to the fact that at some point it would be reading a section of the buffer that doesn't contain any valid information.

## A Hardware Interlude

Previously we asked:

> What if we have chunks of data that should remain contiguous in memory when written to the buffer?

But when would we actually require that data be read or written to in a contiguous manner?

### DMA - Direct Memory Access

In embedded microcontroller systems, it is common to have a single core CPU. Instead of having multiple cores, they have a set of features referred to as Memory Mapped Peripherals. These Peripherals act as hardware accelerators for specific behaviors, such as sending or receiving data from a serial port.

In order to minimize the amount of time necessary for the CPU to manually copy data from one place to another, these Peripherals can be configured to perform an action completely autonomously, streaming data to or from a section of memory on the CPU. This action of the hardware directly reading from or writing to the memory is called DMA, or Direct Memory Access.

Instead of reading or writing one byte at a time to the Serial Port, the CPU can instead start the transfer, and when it is complete, process a chunk of bytes at a time. This allows for less time waiting, and is generally a more efficient method of processing data.

A typical usage of DMA (called a DMA transaction) looks like this:

1. The CPU allocates N bytes of memory to be used for DMA
2. The CPU instructs the peripheral, such as a serial port, to receive N bytes of data, and to place those bytes in the memory allocated in step 1
3. Once the peripheral is configured, the CPU resumes performing other actions, and the Serial Port begins filling data into the memory buffer as it is received
4. When the Serial Port has received all N bytes requested, it notifies the CPU, and stops receiving data
5. The CPU may now process all N bytes requested, and if necessary, repeat the process at step one

Although we often only have one CPU core in most microcontrollers, we can think of these DMA actors as their own thread. They are able to operate independently of the main CPU's actions, and read and write memory based on their own needs. In these microcontroller systems, there can be tens or hundreds of these hardware actors, all operating in parallel!

### Stackless Operation

In step one of DMA procedure above, we talked about allocating N bytes of memory. On a non-embedded system, this would generally be done by allocating space on the heap - a `Box` in Rust, or using `malloc()` in C. In lightweight or timing critical embedded systems, it is uncommon to have a heap. Instead, all memory must be statically allocated, or allocated through the use of the stack.

In these systems, data structures such as Circular Buffers are used to work around these limitations. A fixed amount of space is reserved for use, and a dynamic amount of data within a fixed maximum region is used to simulate a dynamic memory region.

Unfortunately, these DMA transactions do not understand the concept of a circular buffer. They are only aware of a pointer to where the memory region starts, and how many bytes to use from the starting pointer. This means that a normal circular buffer where the data region could wrap around would not work for DMA transfers.

### But why is DMA so important?

For operations used with DMA, the speed at which bytes are transferred is often many orders of magnitude slower than the operation of the CPU itself. For a 32 bit ARM CPU, copying 4 bytes from RAM takes a single cycle. In a 64MHz CPU, this means it will take 15.6 nanoseconds to copy these four bytes.

A typical serial port configuration is "115200 8N1", which means 115,200 baud (or raw bits on the wire per second), with no parity, and 1 stop bit. This means that for every data byte sent, there will be 8 data bits, 1 unused parity bit, and 1 stop bit, to signal the end of the byte, sent over the wire.

This means that we will need 40 bits on the wire to receive a 4 data bytes. At 115,200 bits on the wire per second, this means it will take 347,220 nanoseconds to receive the same four bytes, taking **22,222 times as long** as it takes our CPU to copy the same amount of data!

Instead of making our CPU waste all of this time waiting around, we allow the hardware to manage the simple sending and receiving process, allowing our CPU to either process other important tasks, or go into sleep mode, saving power or battery life.

### From embedded to datacenters

People writing high-performance application for datacenter grade servers have long realised this is also true for the high-grade, power-hungry CPUs they use.

Modern, efficient network stacks for servers use similar DMA techniques to offload all of this work to the network card, so that valuable CPU time can be spent running data-crunching applications.

### A fork in the road

Here's where the original BipBuffer design decides to maintain two "regions" of valid data, one at the start and one at the end of the buffer: this way it can keep track of which sections of the buffers contain valid data. Have a look at the [BipBuffer](https://www.codeproject.com/Articles/3479/The-Bip-Buffer-The-Circular-Buffer-with-a-Twist) blog post on CodeProject for details on how this works.

The design based on two regions works great in a single threaded environment, but requires swapping the references to two regions when the rightmost one is depleted. This is tricky to do without explicit locking (mutexes) for cases in which the writer and reader reside on different threads.

Our use case is communication between two concurrent threads of control: either two actual OS threads, or a main thread of control and an interrupt handler in embedded or a device driver. This is where our design takes inspiration from the _BipBuffer_, but goes in a different direction.

## Concurrency design

A common strategy to reduce the amount of coordination that needs to happen between the two threads (writer, reader) is to associate each coordination variable (pointer) with a single thread that has exclusive write access to it. This also happens to simplify reasoning about the design, because it's always clear who's in charge of changing which variable.

So, let's start with a simple circular buffer that has the `write` and `read` pointers from before. The writer is the only one who ever changes `write`, and the reader is the only one who increments `read`.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/zfwNfD0.png %})

So far so good. Each thread is only concerned with writing to one variable, and reading from the other.

### High watermark for data

Now let's re-introduce the requirement that the data written may need to be contiguous. If there's no space available at the end of the buffer, the writer wraps around and writes the whole contiguous chunk at the start.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/Lb8C3sq.png %})

As we've seen, we need a way to tell the reader which part of the buffer is valid, and which was skipped to be able to write a single contiguous chunk. We're tracking the high watermark of valid data in the buffer, so what about a `watermark` pointer that gets written when the writer wraps around and leaves empty space at the end?

Going back to our idealised infinite buffer from before, here's what things would look like. Whenever the valid region isn't split in two parts (at the beginning and end of the actual buffer) we simply need to track the write and read pointers, as before. On the other hand, when valid data wraps around the buffer, we leave an artificial "hole" in the "infinite buffer" representation. The `watermark` lets us keep track of where the "hole" starts, and the end of the physical buffers marks the end.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/lZrudcU.png %})

## Implementation

We have all the necessary elements for our non-blocking implementation. We start with the `write` and `read` pointers aligned at the start of the buffer and the `watermark` aligned with the end.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/nS0tBm1.png %})

```rust
struct ContiguousAsyncBuffer {
  buf: *mut u8,
  len: usize,
  read: AtomicUsize,
  write: AtomicUsize,
  watermark: AtomicUsize,
}
```

We use `AtomicUsize` to let the two threads read and update the pointers concurrently and safely. The writer/sender thread is in charge of `write` and `watermark`, the reader/receiver is in charge of `read`. This is important! Contended writes from multiple threads on the same memory location are a lot harder for the CPU's cache coherence protocol to handle, and will cost latency and throughput. 
What's more, it's a lot easier to reason about correctness of these concurrent protocols if each of the shared pointers are always written by a certain thread (their "owner").

### Writing

As long as there's enough contiguous buffer space before the end of the physical buffer, as new data arrives (of length `write_len`) the sender thread moves the `write` pointer forwards to signal that a new chunk of the buffer is now valid and can be read.

```rust
// [writer thread]
buffer.write.store(buffer.write.load() + write_len)
```

When new data arrives and the `write` pointer is close to the end, it moves the watermark to its current location, then wraps around. Again, if the `read` pointer is still close to the beginning, this has the potential of clobbering data that hasn't yet been processed by the reader. For this reason, the `write` pointer is not allowed to overtake `read` after it has wrapped around.

```rust
// [writer thread]
if buffer.len.saturating_sub(buffer.write.load()) >= write_len {
  // not shown: check `read` to make sure there's enough free room
  buffer.watermark.store(buffer.write.load() + write_len);
  buffer.write.store(buffer.write.load() + write_len);
} else { // not enough space, wrap around
  // not shown: check `read` to make sure there's enough free room at the beginning of the buffer
  buffer.watermark.store(buffer.write.load());
  buffer.write.store(0 + write_len);
}
```

You may have noticed that the writer also pushes the `watermark` forward when there's room at the end of the buffer. We need to do this because we may have moved it back on a previous wrap-around and we want to avoid the reader now misinterpreting it as a sign that there's a "hole" at the end.

### Reading

We end up again with two possible memory configurations:

1. `write` leads and `read` follows (`write` ≥ `read`), the valid data (written, but not yet processed by the reader) is in the section of the buffer after `read` and before `write`;
2. `read` leads and `write` follows (`read` > `write`), the valid data is after `read`, till the `watermark`, and from the start of the buffer till `write`.

![]({{ site.baseurl }}{% link assets/posts/the-design-and-implementation-of-a-lock-free-ring-buffer-with-contiguous-reservations/vgqghy7.png %})

This makes the reader thread's logic simple: read till you hit the `write` pointer, or the `watermark`, and update the `read` pointer accordingly.

### A note on memory ordering

Some of you may have noticed that all of our calls to `load` don't take arguments and our calls to `store` take a single argument, the new value for the `AtomicBool`. This isn't valid code, of course. The real signatures take another argument: `ordering: Ordering`.
This instructs llvm on how to emit the proper memory fences and `sync` instructions to drive the cache coherence and synchronization mechanisms built into the CPUs.

The safe thing to do here is to always choose `Ordering::SeqCst`, "sequential consistency", which provides the strongest guarantees. On x86, due to the hardware design, anything other than `Ordering::Relaxed` is equivalent to `SeqCst`. On ARMv7/v8, things get more complicated.

We recommend reading up on [`Ordering`](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html) both in the rust doc and in the documentation for your platform. For the purpose of this post, just assume we used `Ordering::SeqCst` everywhere. This is often good enough in practice, and switching to a weaker `Ordering` is only necessary to squeeze out the last bit of performance.

In Andrea's implementation of the lock-free ring-buffer, [spsc-bip-buffer](https://github.com/utaal/spsc-bip-buffer), some of the orderings are relaxed for performance. This has the downside that it can introduce subtle concurrency bugs that may only show up on some platform (ARM, for example): to be a bit more confident that everything's still fine, Andrea's has continous integation tests both on x86 and ARM.

### Support for embedded systems

In James' implementation of the lock-free ring-buffer, [bbqueue](https://github.com/jamesmunns/bbqueue), convenience interfaces are provided for statically allocating instances of the ring-buffer. The queue can be split into Producer and Consumer halves, allowing for use of one half in interrupt context, and the other half in non-interrupt (or a different interrupt) context.
