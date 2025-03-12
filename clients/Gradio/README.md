# PrivateGPT Multi-Backend Demo Chat App

## Description
This is a small demo demonstrating the usage of both, the VLLM API and the PrivateGPT API via RAG.
Note: This is still under development and might change in the future
---

## Prerequisites
- Python 3.8 or higher
- Access to the PrivateGPT server
- Access to the VLLM API on PrivateGPT

---

## Setup
1. **Clone the repository:**
    ```bash
    git clone [https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git](https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git)
    cd MCP-Server-for-MAS-Developments/
    ```

2. **Optional: Create and activate a virtual environment:**
    ```bash
    python -m venv venv
    ```

    - **Windows:**
        ```bash
        .\venv\Scripts\activate
        ```

    - **Unix/MacOS:**
        ```bash
        source venv/bin/activate
        ```

3. **Install dependencies:**
    ```bash
    pip install -r .\clients\Gradio\requirements.txt
    ```

   4. **Customise configuration file:**

      - 4.1 **Configuration for Gradio Client:**

          Copy the `config.json.example` file to `config.json` e.g. with  `cp  .\clients\Gradio\config.json.example  .\clients\Gradio\config.json`
          Make sure that the `config.json` is configured correctly and contains all necessary fields. The file should look like this:
          ```json
          {
               "base_url": "https://.../api/v1",
               "proxy_user": "",
               "proxy_password": "",
               "access_header": "",
               "vllm_url": "https://.../api/v1",
               "vllm_api_key": "",
               "language": "en",
               "use_public": true
           }

          ```
        

    
5. **Start the UI:**
   - 5.1 **Start the multi-backend Gradio Client Demo:**
     ```bash
     python -m clients.Gradio.main
     ```


## License
This project is licensed under the MIT License - see the LICENSE file for details.