import { Command, Plugin } from "@opencode/plugin/gui"

const isAbsolute = (path: string) =>
  path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")

const reason = (cause: unknown) => {
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { message?: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return String(cause)
}

export default Plugin.define({
  i18n: {
    en: {
      "command.cd": "Change working directory",
      "command.cd.description": "Move this session to another directory",
      "cd.no-session.title": "No session open",
      "cd.no-session.description": "Open a session, then run /cd again.",
      "cd.need-path.title": "Directory is required",
      "cd.need-path.description": "Type /cd with a directory, or run /cd alone to pick one.",
      "cd.failed.title": "Failed to change directory",
      "cd.moved.title": "Session moved",
      "cd.queued.title": "Session will move",
      "cd.queued.description": "The move applies when the current step finishes.",
      "cd.pick.title": "Move this session to…",
    },
  },
  setup(ctx) {
    ctx.add(Command, (): Command => {
      const mounted = ctx.sessions.current()

      return {
        id: "cd",
        title: ctx.t("command.cd"),
        description: ctx.t("command.cd.description"),
        keywords: "cd directory folder move session project workspace location",
        section: "session",
        slash: { name: "cd", arguments: true },
        enabled: !!mounted,
        run: async (input) => {
          // Read again: the command outlives the render that registered it.
          const session = ctx.sessions.current()

          if (!session) {
            ctx.toast.show({
              title: ctx.t("cd.no-session.title"),
              description: ctx.t("cd.no-session.description"),
              variant: "error",
            })
            return
          }

          let directory = input?.trim() ?? ""

          if (!directory) {
            if (!ctx.desktop) {
              ctx.toast.show({
                title: ctx.t("cd.need-path.title"),
                description: ctx.t("cd.need-path.description"),
                variant: "error",
              })
              return
            }

            const picked = await ctx.desktop
              .pick({ directory: true, title: ctx.t("cd.pick.title") })
              .catch((cause: unknown) => {
                ctx.toast.show({
                  title: ctx.t("cd.failed.title"),
                  description: reason(cause),
                  variant: "error",
                })
                return undefined
              })
            if (!picked?.[0]) return
            directory = picked[0]
          }

          // Populate the client's location cache before the session mounts in the destination. Only
          // absolute paths: `~` and relative ones are resolved by the server, inside the session's
          // current directory, and the client cannot resolve them the same way.
          if (isAbsolute(directory)) await session.server.data.location.syncInfo({ directory }).catch(() => undefined)

          // The server accepts a move while a session runs and applies it at the next step boundary.
          const running = session.server.data.session.status(session.id) === "running"

          try {
            await session.server.client.session.move(
              { sessionID: session.id, directory },
              { signal: ctx.signal },
            )
          } catch (cause) {
            if (ctx.signal.aborted) return
            ctx.toast.show({
              title: ctx.t("cd.failed.title"),
              description: reason(cause),
              variant: "error",
            })
            return
          }

          if (running) {
            ctx.toast.show({
              title: ctx.t("cd.queued.title"),
              description: ctx.t("cd.queued.description"),
            })
            return
          }

          ctx.toast.show({
            title: ctx.t("cd.moved.title"),
            description: directory,
            variant: "success",
          })
        },
      }
    })
  },
})
