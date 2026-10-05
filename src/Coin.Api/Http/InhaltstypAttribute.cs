using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Formatters;

namespace Coin.Api.Http;

/// <summary>
/// Ersetzt <c>[Consumes]</c>: prüft den Content-Type erst nach der Autorisierung und antwortet sonst mit 415.
/// <c>[Consumes]</c> wirkt bereits beim Endpunkt-Routing; dort entstünde für angemeldete Benutzer ohne Schreibrolle
/// ein 415 statt 403 (AK-19: 401/403 gehen vor 415).
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class InhaltstypAttribute(string inhaltstyp) : Attribute, IResourceFilter, IApiRequestMetadataProvider
{
    private readonly MediaType _erlaubt = new(inhaltstyp);

    public string Inhaltstyp { get; } = inhaltstyp;

    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var contentType = context.HttpContext.Request.ContentType;
        if (string.IsNullOrWhiteSpace(contentType) || !IstErlaubt(contentType))
        {
            // Wird vom ApiController-Verhalten (Client-Fehler-Mapping) als ProblemDetails ausgegeben.
            context.Result = new UnsupportedMediaTypeResult();
        }
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }

    public void SetContentTypes(MediaTypeCollection contentTypes)
    {
        contentTypes.Clear();
        contentTypes.Add(Inhaltstyp);
    }

    private bool IstErlaubt(string contentType)
    {
        try
        {
            return new MediaType(contentType).IsSubsetOf(_erlaubt);
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException or InvalidOperationException)
        {
            return false;
        }
    }
}
