class AppendSlashWithoutRedirectMiddleware:
    """
    Ensures API requests arriving via reverse proxies (e.g. Vercel rewrites) that strip
    trailing slashes are resolved by Django URL patterns without issuing a 301 redirect
    or failing POST requests.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path_info.startswith('/api/') and not request.path_info.endswith('/'):
            request.path_info = request.path_info + '/'
            request.path = request.path + '/'
        return self.get_response(request)
