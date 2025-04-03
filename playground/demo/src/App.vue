<script setup lang="ts">
console.log(add(1, 3))
</script>

<template>
  <div class="container">
    <div>@wendraw/lib: hello() => {{ hello() }} Starry</div>
    <div>@wendraw/lib: add(1, 2) => {{ add(1, 2) }}</div>
    <div>@wendraw/lib/inner: innerSub(1, 2) => {{ innerSub(1, 2) }}</div>
  </div>
</template>

<style >
body, html {
  margin: 0;
  padding: 0;
}
.container {
  display: flex;
  width: 100vw;
  height: 100vh;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  color: lightgreen;
  background-color: #000;
}
</style>
