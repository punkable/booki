/* A session queue. Only one native job owns progress; late events cannot paint
   a different download. URLs and paths stay in memory and are never persisted. */
export function createDownloadQueue({ run, cancel, changed = () => {}, completed = () => {} }) {
  const jobs = [];
  let active = null;
  let serial = 0;
  const publish = () => changed(jobs.slice(), active);
  const pump = async () => {
    if (active) return;
    const job = jobs.find((row) => row.state === "queued");
    if (!job) return;
    active = job; job.state = "start"; publish();
    try {
      const path = await run(job);
      job.path = path || job.path;
      job.state = "done";
      job.percent = 100;
      if (job.state === "done") { try { completed(job); } catch (_) { /* notification failure cannot fail a saved file */ } }
    } catch (error) {
      job.state = job.cancelRequested ? "cancelled" : "error";
      job.error = String(error?.message ?? error ?? "");
    } finally {
      active = null; publish(); void pump();
    }
  };
  return {
    get jobs() { return jobs.slice(); },
    get active() { return active; },
    enqueue(entries) {
      // Retain at most 50 recent results, without dropping pending work.
      while (jobs.length + entries.length > 50) {
        const at = jobs.findIndex((job) => ["done", "error", "cancelled"].includes(job.state));
        if (at < 0) break;
        jobs.splice(at, 1);
      }
      if (jobs.length + entries.length > 50) throw new Error("queue full");
      const added = entries.map((entry) => ({ ...entry, id: `booki-${Date.now()}-${++serial}`, state: "queued", percent: 0, title: "", path: "", error: "" }));
      jobs.push(...added); publish(); void pump(); return added;
    },
    progress(event) {
      if (!active || event?.id !== active.id || active.cancelRequested || !["start", "progress"].includes(event.state)) return;
      active.state = event.state;
      const percent = Number(event.percent);
      active.indeterminate = percent < 0;
      active.percent = Number.isFinite(percent) ? Math.max(0, Math.min(99, percent)) : 0;
      if (event.title) active.title = String(event.title);
      publish();
    },
    async cancel(id) {
      const job = jobs.find((row) => row.id === id);
      if (!job) return;
      if (job.state === "queued") { job.state = "cancelled"; publish(); return; }
      if (active !== job || job.cancelRequested) return;
      // Do not advance until the native process has actually stopped.
      job.cancelRequested = true; publish();
      try { if (await cancel(job.id) === false) { job.cancelRequested = false; publish(); } }
      catch (error) { job.cancelRequested = false; job.error = String(error); publish(); throw error; }
    },
    retry(id) {
      const job = jobs.find((row) => row.id === id);
      if (!job || !["error", "cancelled"].includes(job.state)) return;
      return this.enqueue([{ url: job.url, format: job.format, directory: job.directory }]);
    },
    clear() {
      for (let i = jobs.length - 1; i >= 0; i--) if (["done", "error", "cancelled"].includes(jobs[i].state)) jobs.splice(i, 1);
      publish();
    },
  };
}
