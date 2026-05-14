<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<a
	class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-[oklch(0.23_0.03_75)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[oklch(0.98_0.01_92)]"
	href="#main-content">跳到主要内容</a
>
{@render children()}
