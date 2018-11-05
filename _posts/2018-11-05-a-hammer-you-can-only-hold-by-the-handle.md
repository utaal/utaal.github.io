---
layout: post
author: Andrea Lattuada
title: A hammer you can only hold by the handle
link: //blog.systems.ethz.ch/blog/2018/a-hammer-you-can-only-hold-by-the-handle.html
action: Continue reading on the Systems Group blog
---

Today we're looking at the rust borrow checker from a different perspective. As you may know, the borrow checker is designed to safely handle memory allocation and ownership, preventing accessess to invalid memory and ensuring data-race freedom. This is a form of resource management: the borrow checker is tracking who's in charge of a chunk of memory, and who is currently allowed to read or write to it. In this post, we'll see how these facilities can be used to enforce higher-level API constraints in your libraries and software. Once you're familiar with these techniques, we'll cover how the same principles apply to advanced memory management and handling of other more abstract resources.
