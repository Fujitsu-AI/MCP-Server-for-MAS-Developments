# Use an official Python runtime as a parent image
FROM python:3.12

# Set the working directory in the container
WORKDIR ./

# Copy the requirements file into the container
COPY agents/OpenAI_Compatible_API_Agent/requirements.txt ./

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY ./agents/OpenAI_Compatible_API_Agent/ ./agents/OpenAI_Compatible_API_Agent/
# Copy the AgentInterface code into the container
COPY ./agents/AgentInterface/ ./agents/AgentInterface/


# Define the command to run the application
CMD ["python", "-m", "agents.OpenAI_Compatible_API_Agent.Python.openai_compatible_api"]
