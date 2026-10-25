const foldLoginOutMessage = Application.makeOutMessageFold(Login.LoginBlock, {
  RequestedMagicLink: ({ email }, { liftCommand }) =>
    Application.makeStep(model => ({
      model,
      commands: [
        liftCommand(Login.SendMagicLink({ email, redirectRoute: model.route })),
      ],
    })),
})
