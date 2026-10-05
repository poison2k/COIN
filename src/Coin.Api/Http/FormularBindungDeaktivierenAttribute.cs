using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Coin.Api.Http;

/// <summary>
/// Verhindert, dass das Model Binding das multipart-Formular vorab liest. Sonst würde eine Überschreitung
/// der Upload-Limits beim Binden (z. B. der Route-ID) zu einem 400 statt zu einem 413 (AK-25).
/// Die Aktion liest das Formular selbst über <see cref="MultipartDateiLeser"/>.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class FormularBindungDeaktivierenAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var factories = context.ValueProviderFactories;
        factories.RemoveType<FormValueProviderFactory>();
        factories.RemoveType<FormFileValueProviderFactory>();
        factories.RemoveType<JQueryFormValueProviderFactory>();
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}
